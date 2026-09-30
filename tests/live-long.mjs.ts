// Real-model check on a LONG, messy text: schema followed? ranges valid? how much is mapped?
import { readFileSync } from 'node:fs';
import { buildCompressorPrompt, parseCompressed, sourceRuns, coverage, overlapRatio, knowledgeCompressorSchema, segments } from '../lib/compressor.ts';
import { buildLocalRequest, parseReply } from '../lib/llmClient.ts';
import { DEFAULT_LLM } from '../lib/llmConfig.ts';

const SRC = readFileSync(new URL('./long-messy.txt', import.meta.url), 'utf8');
const enc = new TextEncoder();
console.log(`chars=${SRC.length} bytes=${enc.encode(SRC).length} segments=${segments(SRC).length}`);

const req = buildLocalRequest(DEFAULT_LLM, {
  system: 'You compress text into idea clusters and return ONLY the structured result.',
  prompt: buildCompressorPrompt(SRC, 'concise and neutral'),
  temperature: 0.3,
  schema: { name: 'knowledge_compressor', schema: knowledgeCompressorSchema },
});
req.url = 'http://127.0.0.1:8081/v1/chat/completions';
const t0 = Date.now();
const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
console.log('http', res.status, ((Date.now() - t0) / 1000).toFixed(1) + 's');
const raw = parseReply('local', await res.json());
let p;
try { p = parseCompressed(raw, SRC); } catch (e) { console.log('PARSE FAIL:', e.message, '\nRAW:', raw.slice(0, 400)); process.exit(1); }
console.log(`clusters=${p.clusters.length} invalid_ranges_dropped=${p.dropped} coverage=${(coverage(SRC, p.clusters) * 100).toFixed(0)}% overlap=${(overlapRatio(SRC, p.clusters) * 100).toFixed(0)}%`);
const runs = sourceRuns(SRC, p.clusters);
p.clusters.forEach((c, i) => {
  console.log(`\n[${i}] ${c.color_theme.toUpperCase()}: ${c.rewritten_text}`);
  console.log('    ranges', JSON.stringify(c.source_byte_ranges));
  console.log('    kaynak:', runs.filter(r => r.cluster === i).map(r => r.text.trim().replace(/\s+/g, ' ').slice(0, 70)).join('  |  '));
});
const un = runs.filter(r => r.cluster < 0).map(r => r.text.trim().replace(/\s+/g, ' ')).filter(Boolean);
console.log('\nESLENMEYEN:', un.length ? un.map(t => t.slice(0, 70)).join('  |  ') : '(yok)');
console.log('renkler benzersiz mi:', new Set(p.clusters.map(c => c.color_theme)).size === p.clusters.length);
