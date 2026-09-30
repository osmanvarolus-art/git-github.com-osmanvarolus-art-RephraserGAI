// Sends the EXACT prompt printed by test-ajan.mjs to the real model and checks the answer against ground truth.
import { execFileSync } from 'node:child_process';

const out = execFileSync('node', [new URL('../test-ajan.mjs', import.meta.url).pathname], { encoding: 'utf8' });
const prompt = out.split('\n').slice(1).join('\n').trim();
const N = (prompt.match(/^\[\d+\]/gm) || []).length;
const IRRELEVANT = new Set([2, 4, 7, 10, 13, 16]); // dog, wifi, joke, coffee, sandwich, rent
const COLORS = new Set(['green', 'orange', 'blue', 'red']);

async function ask() {
  const res = await fetch('http://127.0.0.1:8081/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'bonsai-27b', temperature: 0.3, max_tokens: 2500,
      chat_template_kwargs: { enable_thinking: false },
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  return (await res.json()).choices[0].message.content;
}

for (let run = 1; run <= 3; run++) {
  const t0 = Date.now();
  const raw = await ask();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  let j: any;
  try { j = JSON.parse(raw); } catch { console.log(`\nKOSU ${run}: JSON DEGIL (${secs}s):`, raw.slice(0, 200)); continue; }
  const problems: string[] = [];
  const seen = new Map<number, number>();
  const used = new Set<number>();
  (j.clusters || []).forEach((c: any, ci: number) => {
    if (!COLORS.has(c.color_theme)) problems.push(`kume${ci}: renk "${c.color_theme}" gecersiz`);
    if (!Array.isArray(c.universal_keywords) || !c.universal_keywords.length) problems.push(`kume${ci}: keyword yok`);
    if (!String(c.rewritten_text || '').trim()) problems.push(`kume${ci}: ozet bos`);
    for (const id of c.sentence_ids || []) {
      if (!Number.isInteger(id) || id < 0 || id >= N) { problems.push(`kume${ci}: gecersiz id ${id}`); continue; }
      if (seen.has(id)) problems.push(`id ${id} hem kume${seen.get(id)} hem kume${ci} icinde`);
      seen.set(id, ci); used.add(id);
    }
  });
  const leaked = [...used].filter(i => IRRELEVANT.has(i));
  const missed = [...Array(N).keys()].filter(i => !IRRELEVANT.has(i) && !used.has(i));
  console.log(`\nKOSU ${run} (${secs}s): ${j.clusters?.length ?? 0} kume | sorun: ${problems.length ? problems.join('; ') : 'yok'}`);
  console.log(`  alakasiz cumle icine girdi: ${leaked.length ? '[' + leaked + ']' : 'hayir (iyi)'}   |   ilgili ama atlanan: ${missed.length ? '[' + missed + ']' : 'yok'}`);
  (j.clusters || []).forEach((c: any) => console.log(`  ${String(c.color_theme).padEnd(6)} ids=[${c.sentence_ids}]  kw=${(c.universal_keywords || []).join(' · ')}\n         ${String(c.rewritten_text).slice(0, 150)}`));
}
