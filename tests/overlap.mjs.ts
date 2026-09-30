import { readFileSync } from 'node:fs';
const b = new TextEncoder().encode(readFileSync(new URL('./long-messy.txt', import.meta.url), 'utf8'));
const d = new TextDecoder();
const show = (s: number, e: number, tag: string) => console.log(`${tag} [${s},${e}]: ${d.decode(b.subarray(s, e)).replace(/\s+/g, ' ').slice(0, 260)}\n`);
show(1380, 1569, 'MOR-ONLY (kod+domino+jev basi)');
show(1569, 2076, 'CAKISMA (mor kazaniyor, ama kirmizi da istiyor)');
show(2076, 2802, 'KIRMIZI-ONLY');
show(844, 973, 'ESLENMEYEN');
