import test from 'node:test';
import assert from 'node:assert/strict';
import {
  segments, buildCompressorPrompt, parseCompressed, sourceRuns, coverage, overlapRatio, compressBest, mirrorRatio,
  COMPRESSOR_SYSTEM, SEMANTIC_DNA_TONE, knowledgeCompressorSchema, COLORS,
} from '../lib/compressor.ts';

const enc = new TextEncoder();
const dec = new TextDecoder();
const T = 'Cats sleep a lot. Dogs bark loudly! Birds fly south in winter.';
const total = enc.encode(T).length; // 62; sentences occupy bytes [0,18) [18,36) [36,62)

// ---- schema ----
test('schema: 5 colors, sentence_ids replaces byte ranges, keywords required', () => {
  const s: any = knowledgeCompressorSchema;
  assert.deepEqual(s.required, ['clusters']);
  const item = s.properties.clusters.items;
  assert.deepEqual(item.properties.color_theme.enum, [...COLORS]);
  assert.deepEqual(item.required, ['color_theme', 'rewritten_text', 'sentence_ids', 'universal_keywords']);
  assert.ok(!('source_byte_ranges' in item.properties));
  assert.equal(item.properties.sentence_ids.items.type, 'integer');
  assert.equal(item.properties.sentence_ids.items.minimum, 0);
  assert.equal(item.properties.sentence_ids.minItems, 1);
});
test('schema: universal_keywords is an array of strings, at least one', () => {
  const kw: any = (knowledgeCompressorSchema as any).properties.clusters.items.properties.universal_keywords;
  assert.equal(kw.type, 'array');
  assert.equal(kw.items.type, 'string');
  assert.equal(kw.minItems, 1);
  assert.match(kw.description, /strict industry terms replacing the user's informal concepts/);
});

// ---- segments ----
test('segments: exact byte offsets that tile the text', () => {
  const s = segments(T);
  assert.deepEqual(s.map(x => [x.start, x.end]), [[0, 18], [18, 36], [36, 62]]);
  assert.deepEqual(s.map(x => x.text), ['Cats sleep a lot.', 'Dogs bark loudly!', 'Birds fly south in winter.']);
  const b = enc.encode(T);
  for (const x of s) assert.equal(dec.decode(b.subarray(x.start, x.end)).trim(), x.text);
});
test('segments: multi-byte text counts bytes, not characters', () => {
  const t = 'Çay içtim. Şeker attım.';
  const s = segments(t);
  assert.equal(s.length, 2);
  assert.equal(s[1].start, enc.encode('Çay içtim. ').length);
  assert.equal(s[1].end, enc.encode(t).length);
  assert.ok(s[1].end > t.length);
});
test('segments: odd inputs never lose text or crash', () => {
  assert.deepEqual(segments(''), []);
  assert.deepEqual(segments('  \n '), []);
  assert.equal(segments('no punctuation at all').length, 1);
  assert.equal(segments('a.b.c')[0].start, 0);
  const nl = segments('line one\nline two\n\nhi');
  assert.deepEqual(nl.map(x => x.text), ['line one', 'line two', 'hi']);
  const b = enc.encode('line one\nline two\n\nhi');
  assert.equal(dec.decode(b.subarray(nl[2].start, nl[2].end)), 'hi');
  assert.equal(segments('😀 emoji! ok?').length, 2);
});

// ---- prompt ----
test('prompt: numbered sentences, count, tone, rules', () => {
  const p = buildCompressorPrompt(T, 'blunt');
  assert.match(p, /tone: blunt/);
  assert.match(p, /There are 3 sentences, numbered \[0\] to \[2\]/);
  assert.match(p, /\[0\] Cats sleep a lot\./);
  assert.match(p, /\[2\] Birds fly south in winter\./);
  assert.match(p, /sentence_ids/);
  assert.match(p, /Ignore irrelevant stories, jokes/);
  assert.match(p, /at most one cluster/);
  assert.match(p, /never reuse a color/);
  assert.match(p, /concrete facts/);
  assert.doesNotMatch(p, /byte/i);
});

// ---- parse ----
const good = (ids: unknown, extra: object = {}) =>
  JSON.stringify({ clusters: [{ color_theme: 'green', rewritten_text: 'Cats sleep.', sentence_ids: ids, universal_keywords: ['Feline Rest Cycle'], ...extra }] });

test('parse: sentence ids become exact byte ranges', () => {
  const p = parseCompressed(good([0]), T);
  assert.equal(p.dropped, 0);
  assert.deepEqual(p.clusters[0].source_byte_ranges, [[0, 18]]);
  assert.deepEqual(parseCompressed(good([1]), T).clusters[0].source_byte_ranges, [[18, 36]]);
});
test('parse: neighbours merge, gaps stay separate, order and duplicates do not matter', () => {
  assert.deepEqual(parseCompressed(good([0, 1]), T).clusters[0].source_byte_ranges, [[0, 36]]);
  assert.deepEqual(parseCompressed(good([0, 2]), T).clusters[0].source_byte_ranges, [[0, 18], [36, 62]]);
  assert.deepEqual(parseCompressed(good([2, 0, 1, 1]), T).clusters[0].source_byte_ranges, [[0, 62]]);
});
test('parse: invalid ids are dropped and counted, never trusted', () => {
  const p = parseCompressed(good([-1, 99, 1.5, 'a', null, 0]), T);
  assert.equal(p.dropped, 5);
  assert.deepEqual(p.clusters[0].source_byte_ranges, [[0, 18]]);
  assert.deepEqual(parseCompressed(good('nope'), T).clusters[0].source_byte_ranges, []);
});
test('parse: multi-byte source maps to the right characters', () => {
  const t = 'Çay içtim. Şeker attım.';
  const p = parseCompressed(good([1]), t);
  const [[s, e]] = p.clusters[0].source_byte_ranges;
  assert.equal(s, enc.encode('Çay içtim. ').length);
  assert.equal(e, enc.encode(t).length);
  assert.equal(sourceRuns(t, p.clusters).find(r => r.cluster === 0)!.text, 'Şeker attım.');
});
test('parse: strips code fences and surrounding prose', () => {
  assert.equal(parseCompressed('```json\n' + good([0]) + '\n```', T).clusters.length, 1);
  assert.equal(parseCompressed('Here you go: ' + good([0]) + ' done', T).clusters.length, 1);
});
test('parse: rejects non-JSON, empty clusters, empty text', () => {
  assert.throws(() => parseCompressed('nope', T), /JSON/);
  assert.throws(() => parseCompressed('{"clusters":[]}', T), /No clusters/);
  assert.throws(() => parseCompressed(good([0], { rewritten_text: ' ' }), T), /no text/);
});
test('parse: unknown color is replaced, repeated color gets the next free one', () => {
  const one = parseCompressed(good([0], { color_theme: 'pink' }), T);
  assert.equal(one.clusters[0].color_theme, 'green');
  const two = JSON.stringify({ clusters: [
    { color_theme: 'blue', rewritten_text: 'a', sentence_ids: [0], universal_keywords: ['k'] },
    { color_theme: 'blue', rewritten_text: 'b', sentence_ids: [1], universal_keywords: ['k'] },
    { color_theme: 'blue', rewritten_text: 'c', sentence_ids: [2], universal_keywords: ['k'] },
  ] });
  const colors = parseCompressed(two, T).clusters.map(c => c.color_theme);
  assert.equal(new Set(colors).size, 3);
  assert.equal(colors[0], 'blue');
});
test('parse: keywords trimmed and de-duplicated case-insensitively; required', () => {
  const kw = parseCompressed(good([0], { universal_keywords: [' Idempotency ', 'idempotency', '', 'Rate Limiting', 5] }), T);
  assert.deepEqual(kw.clusters[0].universal_keywords, ['Idempotency', 'Rate Limiting', '5']);
  assert.throws(() => parseCompressed(good([0], { universal_keywords: undefined }), T), /universal_keywords/);
  assert.throws(() => parseCompressed(good([0], { universal_keywords: ['  '] }), T), /universal_keywords/);
});

// ---- runs / coverage / overlap (work on byte ranges) ----
test('runs: ranges map to the right text; first cluster wins overlaps; gaps stay unmapped', () => {
  const cl: any = [
    { color_theme: 'green', rewritten_text: 'a', source_byte_ranges: [[0, 17]], universal_keywords: ['k'] },
    { color_theme: 'blue', rewritten_text: 'b', source_byte_ranges: [[10, 35]], universal_keywords: ['k'] },
  ];
  const runs = sourceRuns(T, cl);
  assert.equal(runs.map(r => r.text).join(''), T);
  assert.equal(runs[0].text, T.slice(0, 17));
  assert.equal(runs[0].cluster, 0);
  assert.equal(runs[1].cluster, 1);
  assert.equal(runs[1].text, T.slice(17, 35));
  assert.equal(runs[2].cluster, -1);
});
test('runs: a byte inside a multi-byte character snaps to the whole character', () => {
  const t = 'Çay içtim. Şeker attım.';
  const mid = sourceRuns(t, [{ color_theme: 'red', rewritten_text: 'x', source_byte_ranges: [[1, 4]], universal_keywords: ['k'] }]);
  assert.equal(mid.map(r => r.text).join(''), t);
  assert.equal(mid.find(r => r.cluster === 0)!.text, 'Çay');
});
test('coverage and overlapRatio', () => {
  const a: any = { color_theme: 'green', rewritten_text: 'a', source_byte_ranges: [[0, 17]], universal_keywords: ['k'] };
  const b: any = { color_theme: 'blue', rewritten_text: 'b', source_byte_ranges: [[17, 35]], universal_keywords: ['k'] };
  const c: any = { color_theme: 'red', rewritten_text: 'c', source_byte_ranges: [[10, 20]], universal_keywords: ['k'] };
  assert.ok(Math.abs(coverage(T, [a]) - 17 / T.length) < 1e-9);
  assert.equal(coverage('', [a]), 0);
  assert.equal(overlapRatio(T, [a, b]), 0);
  assert.ok(Math.abs(overlapRatio(T, [a, b, c]) - (7 + 3) / T.length) < 1e-9);
  assert.equal(overlapRatio('', [a]), 0);
});

// ---- anti-mirroring ----
test('system prompt switches mirroring off explicitly and demands industry terms', () => {
  assert.match(COMPRESSOR_SYSTEM, /do NOT mirror/);
  assert.match(COMPRESSOR_SYSTEM, /slang/);
  assert.match(COMPRESSOR_SYSTEM, /industry terminology/);
  assert.match(COMPRESSOR_SYSTEM, /universal_keywords/);
  assert.match(SEMANTIC_DNA_TONE, /Semantic DNA/);
});
test('mirrorRatio: share of keywords that just echo the source (accent/case insensitive)', () => {
  const src = 'Kurye olmayayim, ajanlar konussun. Makbuz sart.';
  const cl = (k: string[]): any => [{ color_theme: 'green', rewritten_text: 'x', source_byte_ranges: [], universal_keywords: k }];
  assert.equal(mirrorRatio(src, cl(['Multi-Agent Orchestration', 'Audit Trail'])), 0);
  assert.equal(mirrorRatio(src, cl(['kurye', 'MAKBUZ', 'Audit Trail', 'Orchestration'])), 0.5);
  assert.equal(mirrorRatio(src, cl([])), 0);
});

// ---- compressBest ----
const reply = (ids: number[][], kw: string[] = ['Industry Term']) =>
  JSON.stringify({ clusters: ids.map((r, i) => ({ color_theme: COLORS[i], rewritten_text: 't' + i, sentence_ids: r, universal_keywords: kw })) });

test('compressBest: good first answer stops after 1 attempt', async () => {
  let n = 0;
  const r = await compressBest(T, async () => { n++; return reply([[0, 1], [2]]); });
  assert.equal(n, 1); assert.equal(r.attempts, 1); assert.equal(r.overlap, 0); assert.equal(r.cov, 1);
});
test('compressBest: overlapping answer is retried and the better one wins', async () => {
  const answers = [reply([[0, 1], [1, 2]]), reply([[0, 1], [2]])];
  let n = 0;
  const r = await compressBest(T, async () => answers[n++]);
  assert.equal(n, 2); assert.equal(r.overlap, 0);
});
test('compressBest: low coverage is retried too', async () => {
  const answers = [reply([[0]]), reply([[0], [1, 2]])];
  let n = 0;
  const r = await compressBest(T, async () => answers[n++]);
  assert.equal(n, 2); assert.equal(r.cov, 1);
});
test('compressBest: all bad -> returns the least bad after max 3 tries', async () => {
  let n = 0;
  const r = await compressBest(T, async () => { n++; return reply([[0, 1], [1, 2]]); });
  assert.equal(n, 3); assert.ok(r.overlap > 0.05);
});
test('compressBest: garbage then good works; only garbage throws', async () => {
  let n = 0;
  const ok = await compressBest(T, async () => (++n === 1 ? 'not json' : reply([[0, 1], [2]])));
  assert.equal(ok.attempts, 2);
  await assert.rejects(compressBest(T, async () => 'nope'), /JSON/);
});
test('compressBest: mirroring answer is retried, the less mirrored one wins', async () => {
  const src = 'alpha beta gamma. delta epsilon zeta.';
  const answers = [reply([[0], [1]], ['alpha', 'beta']), reply([[0], [1]], ['Canonical Term'])];
  let n = 0;
  const r = await compressBest(src, async () => answers[n++]);
  assert.equal(n, 2); assert.equal(r.mirror, 0);
});

test('entityRecall: coined and quoted terms must survive', async () => {
  const { sourceEntities, entityRecall } = await import('../lib/compressor.ts');
  const src = 'We use "Havur Huvur" layers and the Proof-over-Claims rule. Nothing else matters.';
  assert.deepEqual(sourceEntities(src).sort(), ['Havur Huvur', 'Proof-over-Claims']);
  const mk = (t: string) => [{ color_theme: 'green' as const, rewritten_text: t, source_byte_ranges: [] as [number, number][], universal_keywords: ['x'] }];
  assert.equal(entityRecall(src, mk('Havur Huvur and Proof-over-Claims kept')), 1);
  assert.equal(entityRecall(src, mk('generic smoothed text')), 0);
});
