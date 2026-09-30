// A/B on the real model: system prompt WITHOUT anti-mirroring vs WITH. Same text, same schema.
import { readFileSync } from 'node:fs';
import { buildCompressorPrompt, parseCompressed, mirrorRatio, overlapRatio, coverage, knowledgeCompressorSchema, COMPRESSOR_SYSTEM, SEMANTIC_DNA_TONE } from '../lib/compressor.ts';
import { buildLocalRequest, parseReply } from '../lib/llmClient.ts';
import { DEFAULT_LLM } from '../lib/llmConfig.ts';

const SRC = readFileSync(new URL('./long-messy.txt', import.meta.url), 'utf8');
const OLD_SYSTEM = 'You compress text into idea clusters and return ONLY the structured result.';

async function run(system: string) {
  const req = buildLocalRequest(DEFAULT_LLM, {
    system, prompt: buildCompressorPrompt(SRC, SEMANTIC_DNA_TONE), temperature: 0.3,
    schema: { name: 'knowledge_compressor', schema: knowledgeCompressorSchema },
  });
  req.url = 'http://127.0.0.1:8081/v1/chat/completions';
  const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
  return parseCompressed(parseReply('local', await res.json()), SRC);
}
for (const [name, sys] of [['ESKI  (mirroring acik)  ', OLD_SYSTEM], ['YENI  (mirroring kapali)', COMPRESSOR_SYSTEM]] as const) {
  for (let i = 1; i <= 2; i++) {
    try {
      const p = await run(sys);
      console.log(`\n${name} #${i}  mirror=${(mirrorRatio(SRC, p.clusters) * 100).toFixed(0)}%  overlap=${(overlapRatio(SRC, p.clusters) * 100).toFixed(0)}%  cov=${(coverage(SRC, p.clusters) * 100).toFixed(0)}%`);
      p.clusters.forEach((c, k) => console.log(`  [${k}] ${c.color_theme.padEnd(6)} ${c.universal_keywords.join(' · ')}`));
    } catch (e) { console.log(`\n${name} #${i}  HATA: ${(e as Error).message}`); }
  }
}
