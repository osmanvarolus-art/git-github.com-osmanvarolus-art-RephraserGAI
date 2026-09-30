const SRC = `The 24/7 AI Radar scans Twitter, Reddit and arXiv while you sleep and drafts a decision card. Agents talk to each other instead of you copy-pasting between them. Nothing is marked done without a SHA-256 receipt from an independent evaluator. The owner only approves two things: spending money and publishing. Context is compressed into single-line summaries so old output does not drown new work. Lessons learned persist across sessions, so the system does not restart from zero every chat.`;
const b = new TextEncoder().encode(SRC);
const dec = new TextDecoder();
for (const [s, e] of [[0, 94], [94, 162], [162, 309], [309, 490]]) {
  console.log(`[${s},${e}] -> "${dec.decode(b.subarray(s, e))}"`);
}
console.log('total bytes', b.length);
