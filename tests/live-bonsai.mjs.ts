// Real-model check: does bonsai follow the schema and return valid byte ranges?
import { buildCompressorPrompt, parseCompressed, sourceRuns, coverage, knowledgeCompressorSchema } from '../lib/compressor.ts';
import { buildLocalRequest, parseReply } from '../lib/llmClient.ts';
import { DEFAULT_LLM } from '../lib/llmConfig.ts';

const SRC = `The 24/7 AI Radar scans Twitter, Reddit and arXiv while you sleep and drafts a decision card. Agents talk to each other instead of you copy-pasting between them. Nothing is marked done without a SHA-256 receipt from an independent evaluator. The owner only approves two things: spending money and publishing. Context is compressed into single-line summaries so old output does not drown new work. Lessons learned persist across sessions, so the system does not restart from zero every chat.`;

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
console.log('RAW:', raw.slice(0, 300).replace(/\n/g, ' '), '...');
const p = parseCompressed(raw, SRC);
console.log(`clusters=${p.clusters.length} dropped=${p.dropped} coverage=${(coverage(SRC, p.clusters) * 100).toFixed(0)}%`);
const runs = sourceRuns(SRC, p.clusters);
p.clusters.forEach((c, i) => {
  console.log(`\n[${i}] ${c.color_theme}: ${c.rewritten_text}`);
  console.log('    ranges', JSON.stringify(c.source_byte_ranges));
  console.log('    source:', runs.filter(r => r.cluster === i).map(r => r.text.trim().slice(0, 60)).join(' | '));
});
