export const knowledgeCompressorSchema = {
  "type": "object",
  "properties": {
    "clusters": {
      "type": "array",
      "description": "Group the core ideas into 3-5 logical clusters.",
      "items": {
        "type": "object",
        "properties": {
          "color_theme": {
            "type": "string",
            "enum": ["green", "orange", "blue", "purple", "red"],
            "description": "Assign a distinct color to this idea cluster."
          },
          "rewritten_text": {
            "type": "string",
            "description": "The compressed summary of this cluster in the requested tone."
          },
          "sentence_ids": {
            "type": "array",
            "description": "Exact sentence numbers (the [n] markers) from the source that belong to this cluster. Must be accurate.",
            "items": { "type": "integer", "minimum": 0 },
            "minItems": 1
          },
          "universal_keywords": {
            "type": "array",
            "description": "List of strict industry terms replacing the user's informal concepts",
            "items": { "type": "string" },
            "minItems": 1
          }
        },
        "required": ["color_theme", "rewritten_text", "sentence_ids", "universal_keywords"]
      }
    }
  },
  "required": ["clusters"]
};

export const COLORS = ['green', 'orange', 'blue', 'purple', 'red'] as const;
export type Color = (typeof COLORS)[number];
export interface Cluster { color_theme: Color; rewritten_text: string; source_byte_ranges: [number, number][]; universal_keywords: string[] }

// Mirroring is a default LLM alignment behaviour (echo the user's wording, slang and language back).
// It has to be switched off explicitly. The persona is the one already used by the semantic-dna tone.
export const SEMANTIC_DNA_TONE = 'Semantic DNA: strict, industry-standard, atomic value components';
export const COMPRESSOR_SYSTEM = `You are a Principal Semantic Architect. Deconstruct the input into its atomic value components and return ONLY the structured result.
ANTI-MIRRORING RULE (mandatory): do NOT mirror the user's wording, slang, spelling, language or register. The source may be informal, idiosyncratic or mixed-language. Restate every idea in standard industry terminology, the way a domain professional would write it, and never quote the source's informal phrases in rewritten_text.
universal_keywords (mandatory, per cluster): the strict, established industry terms of art (in English) that REPLACE the user's informal concepts. Do not copy the user's own words unless they are already the standard term (for example a protocol, product or algorithm name).
EXCEPTION to anti-mirroring (mandatory): coined names, named doctrines, rules, frameworks and quoted terms that the source introduces (for example a capitalized or hyphenated invented term) are payload, not slang. Keep each one verbatim in rewritten_text, with a short standard-terms gloss beside it if useful. Never delete or rename an unfamiliar concept because it is not industry standard.
Write rewritten_text and universal_keywords in English.`;
export interface Parsed { clusters: Cluster[]; dropped: number; totalBytes: number }
export interface Run { text: string; cluster: number } // cluster -1 = not mapped to any cluster

const enc = new TextEncoder();

export interface Seg { text: string; start: number; end: number } // start/end are UTF-8 byte offsets

// Models cannot count UTF-8 bytes but copy sentence numbers reliably. So the source is cut into numbered
// sentences, the model answers with numbers, and this code maps them back to exact byte ranges.
export function segments(text: string): Seg[] {
  const cut = text.match(/[\s\S]*?(?:[.!?]+(?:\s+|$)|\n+|$)/g)?.filter(Boolean) ?? [];
  const parts = cut.join('') === text ? cut : [text];
  const out: Seg[] = [];
  let off = 0;
  for (const p of parts) {
    const n = enc.encode(p).length;
    if (p.trim()) out.push({ text: p.trim().replace(/\s*\n\s*/g, ' '), start: off, end: off + n });
    off += n;
  }
  return out;
}

export function buildCompressorPrompt(text: string, tone: string): string {
  const segs = segments(text);
  const numbered = segs.map((s, i) => `[${i}] ${s.text}`).join('\n');
  return `Compress the numbered SOURCE sentences into 3-5 logical clusters of core ideas. Use a distinct color per cluster and never reuse a color. Write each cluster's rewritten_text in this tone: ${tone}.
There are ${segs.length} sentences, numbered [0] to [${Math.max(0, segs.length - 1)}]. For each cluster, list in sentence_ids the exact numbers of the sentences that support it.
Rules:
- Ignore irrelevant stories, jokes, complaints and small talk: leave those sentences out of every cluster.
- A sentence belongs to at most one cluster.
- Group by topic. Never put a sentence into a cluster it does not belong to just to raise coverage, and never merge unrelated topics to reach a cluster count.
- Cluster by subject domain (for example food logistics, local AI, building insulation), not by shared vocabulary. Words like temperature, thermal, cold or insulation do not make two domains one topic: keep them in separate clusters, even if that needs the maximum of 5.
- Interleaved or shuffled sentences are common: assign every sentence by its own meaning, not by its neighbours.
- Keep concrete facts (numbers, names, decisions) in rewritten_text; do not replace them with vague wording. Keep each mechanism and consequence (for example alerts on failure, cargo loss, compliance), not only the headline claim.
- universal_keywords: 2-6 strict industry terms per cluster that replace the user's informal concepts (not the user's own wording).

SOURCE:
${numbered}`;
}

function extractJson(raw: string): any {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(s); } catch { /* try the outermost braces */ }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
  throw new Error('Reply is not valid JSON');
}

// Validates the model output against the schema and against the real text. Bad ids are dropped, never trusted.
export function parseCompressed(raw: string, text: string): Parsed {
  const data = extractJson(raw);
  if (!Array.isArray(data?.clusters) || !data.clusters.length) throw new Error('No clusters in reply');
  const segs = segments(text);
  const totalBytes = enc.encode(text).length;
  let dropped = 0;
  const clusters: Cluster[] = data.clusters.map((c: any, i: number) => {
    const rewritten_text = String(c?.rewritten_text ?? '').trim();
    if (!rewritten_text) throw new Error(`Cluster ${i + 1} has no text`);
    const color_theme: Color = COLORS.includes(c?.color_theme) ? c.color_theme : COLORS[i % COLORS.length];
    const ids = new Set<number>();
    for (const id of Array.isArray(c?.sentence_ids) ? c.sentence_ids : []) {
      if (Number.isInteger(id) && id >= 0 && id < segs.length) ids.add(id);
      else dropped++;
    }
    // neighbouring sentences collapse into one range
    const ranges: [number, number][] = [];
    let prev = -2;
    for (const id of [...ids].sort((a, b) => a - b)) {
      if (id === prev + 1) ranges[ranges.length - 1][1] = segs[id].end;
      else ranges.push([segs[id].start, segs[id].end]);
      prev = id;
    }
    const seen = new Set<string>();
    const universal_keywords = (Array.isArray(c?.universal_keywords) ? c.universal_keywords : [])
      .map((k: unknown) => String(k ?? '').trim())
      .filter((k: string) => k && !seen.has(k.toLowerCase()) && !!seen.add(k.toLowerCase()));
    if (!universal_keywords.length) throw new Error(`Cluster ${i + 1} has no universal_keywords`);
    return { color_theme, rewritten_text, source_byte_ranges: ranges, universal_keywords };
  });
  // The model sometimes reuses a color; every cluster gets its own while free colors remain.
  const used = new Set<Color>();
  for (const c of clusters) {
    if (used.has(c.color_theme)) c.color_theme = COLORS.find(x => !used.has(x)) ?? c.color_theme;
    used.add(c.color_theme);
  }
  return { clusters, dropped, totalBytes };
}

// Byte offsets -> UTF-16 indices. A byte inside a multi-byte character snaps outward to the whole character.
function byteMaps(text: string) {
  const total = enc.encode(text).length;
  const start = new Int32Array(total + 1), end = new Int32Array(total + 1);
  let b = 0, u = 0;
  for (const ch of text) {
    const n = enc.encode(ch).length;
    for (let k = 0; k < n; k++) { start[b + k] = u; end[b + k] = k === 0 ? u : u + ch.length; }
    b += n; u += ch.length;
  }
  start[total] = end[total] = text.length;
  return { start, end };
}

// Splits the source into runs, each tagged with the first cluster that claims it.
export function sourceRuns(text: string, clusters: Cluster[]): Run[] {
  const owner = new Int16Array(text.length).fill(-1);
  const { start, end } = byteMaps(text);
  clusters.forEach((c, ci) => {
    for (const [s, e] of c.source_byte_ranges) {
      for (let i = start[s]; i < end[e]; i++) if (owner[i] === -1) owner[i] = ci;
    }
  });
  const runs: Run[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.cluster === owner[i]) last.text += text[i];
    else runs.push({ text: text[i], cluster: owner[i] });
  }
  return runs;
}

export function coverage(text: string, clusters: Cluster[]): number {
  if (!text.length) return 0;
  const mapped = sourceRuns(text, clusters).filter(r => r.cluster >= 0).reduce((n, r) => n + r.text.length, 0);
  return mapped / text.length;
}

// Bytes claimed by more than one cluster. The highlight can only show one owner, so this measures how unreliable the map is.
export function overlapRatio(text: string, clusters: Cluster[]): number {
  if (!text.length) return 0;
  const { start, end } = byteMaps(text);
  const hits = new Uint8Array(text.length);
  for (const c of clusters) {
    const mine = new Uint8Array(text.length);
    for (const [s, e] of c.source_byte_ranges) for (let i = start[s]; i < end[e]; i++) mine[i] = 1;
    for (let i = 0; i < mine.length; i++) hits[i] += mine[i];
  }
  let n = 0;
  for (const h of hits) if (h > 1) n++;
  return n / text.length;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Diagnostic for the mirroring trap: share of keywords whose words all appear in the user's text.
// Legit standard terms can appear in the source too (SHA-256, OAuth), so this is a signal, not a hard rule.
export function mirrorRatio(text: string, clusters: Cluster[]): number {
  const src = ' ' + norm(text) + ' ';
  const kws = clusters.flatMap(c => c.universal_keywords);
  if (!kws.length) return 0;
  return kws.filter(k => src.includes(' ' + norm(k) + ' ')).length / kws.length;
}

// Coined or quoted terms in the source: "quoted", Hyphen-Ated with a capital, or two+ Capitalized words in a row.
export function sourceEntities(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/["“']([^"”'\n]{2,40})["”']/g)) found.add(m[1]);
  for (const m of text.matchAll(/\b[\p{L}\d]+(?:-[\p{L}\d]+)+\b/gu)) if (/\p{Lu}/u.test(m[0])) found.add(m[0]);
  for (const m of text.matchAll(/\b\p{Lu}[\p{L}\d]+(?:\s+\p{Lu}[\p{L}\d]+)+\b/gu)) found.add(m[0]);
  return [...found];
}

// Share of those terms that survive into the rewritten text (ContextEntityRecall). A signal: sentence-start words can false-positive.
export function entityRecall(text: string, clusters: Cluster[]): number {
  const ents = sourceEntities(text);
  if (!ents.length) return 1;
  const out = ' ' + norm(clusters.map(c => c.rewritten_text + ' ' + c.universal_keywords.join(' ')).join(' ')) + ' ';
  return ents.filter(e => out.includes(' ' + norm(e) + ' ')).length / ents.length;
}

export const MAX_OVERLAP = 0.05;
export const MIN_COVERAGE = 0.5; // chatty sources legitimately leave much unmapped
export const MAX_MIRROR = 0.5;

// Runs the model up to `tries` times and keeps the best mapping (least overlap, most coverage, least mirroring).
// Stops early once a result is good enough. A failed attempt (bad JSON / missing keywords) counts as a try.
export async function compressBest(
  text: string,
  ask: () => Promise<string>,
  tries = 3,
): Promise<{ raw: string; parsed: Parsed; overlap: number; cov: number; mirror: number; attempts: number }> {
  let best: { raw: string; parsed: Parsed; overlap: number; cov: number; mirror: number; score: number } | null = null;
  let lastErr: unknown = null;
  let attempts = 0;
  while (attempts < tries) {
    attempts++;
    try {
      const raw = await ask();
      const parsed = parseCompressed(raw, text);
      const overlap = overlapRatio(text, parsed.clusters);
      const cov = coverage(text, parsed.clusters);
      const mirror = mirrorRatio(text, parsed.clusters);
      const score = cov - 3 * overlap - mirror + entityRecall(text, parsed.clusters);
      if (!best || score > best.score) best = { raw, parsed, overlap, cov, mirror, score };
      if (overlap <= MAX_OVERLAP && cov >= MIN_COVERAGE && mirror <= MAX_MIRROR) break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!best) throw lastErr instanceof Error ? lastErr : new Error('Compression failed');
  return { raw: best.raw, parsed: best.parsed, overlap: best.overlap, cov: best.cov, mirror: best.mirror, attempts };
}
