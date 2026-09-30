// The app's REAL code path (compressBest + parseCompressed + schema + anti-mirroring system prompt) against the real model,
// on the drone text with known ground truth. Reports retries, mapping quality and leaks of irrelevant sentences.
import { readFileSync } from 'node:fs';
import { buildCompressorPrompt, compressBest, knowledgeCompressorSchema, COMPRESSOR_SYSTEM, SEMANTIC_DNA_TONE, segments, sourceRuns } from '../lib/compressor.ts';
import { callLlm } from '../lib/llmClient.ts';
import { DEFAULT_LLM } from '../lib/llmConfig.ts';

const SRC = readFileSync(new URL('./drone.txt', import.meta.url), 'utf8').trim();
const segs = segments(SRC);
const IRRELEVANT = new Set([2, 4, 7, 10, 13, 16]); // dog, wifi, joke, coffee, sandwich, rent
const cfg = { ...DEFAULT_LLM, baseUrl: 'http://127.0.0.1:8081/v1' };

let calls = 0;
const ask = () => { calls++; return callLlm(cfg, {
  system: COMPRESSOR_SYSTEM,
  prompt: buildCompressorPrompt(SRC, SEMANTIC_DNA_TONE),
  temperature: 0.3,
  schema: { name: 'knowledge_compressor', schema: knowledgeCompressorSchema },
}); };

for (let run = 1; run <= 4; run++) {
  calls = 0;
  const t0 = Date.now();
  const r = await compressBest(SRC, ask);
  const runs = sourceRuns(SRC, r.parsed.clusters);
  const leaked = segs.map((s, i) => [s, i] as const).filter(([s, i]) => IRRELEVANT.has(i) && runs.some(x => x.cluster >= 0 && x.text.includes(s.text.slice(0, 20))));
  const colors = r.parsed.clusters.map(c => c.color_theme);
  console.log(`\nKOSU ${run}: ${((Date.now() - t0) / 1000).toFixed(1)}s, model cagrisi=${calls}, kume=${r.parsed.clusters.length}, cov=${(r.cov * 100).toFixed(0)}%, overlap=${(r.overlap * 100).toFixed(0)}%, mirror=${(r.mirror * 100).toFixed(0)}%, gecersiz id=${r.parsed.dropped}`);
  console.log(`  renkler benzersiz: ${new Set(colors).size === colors.length}   alakasiz cumle sizdi: ${leaked.length ? leaked.map(([, i]) => i) : 'hayir'}`);
  r.parsed.clusters.forEach(c => console.log(`  ${c.color_theme.padEnd(6)} ${c.universal_keywords.join(' · ')}`));
}
