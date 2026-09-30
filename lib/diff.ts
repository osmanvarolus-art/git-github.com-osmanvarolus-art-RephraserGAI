export interface Seg {
  t: 'same' | 'add' | 'del';
  text: string;
}

const MAX_CELLS = 4_000_000;

// Word-level LCS diff. Whitespace is kept as tokens so joined output is exact.
export function wordDiff(a: string, b: string): Seg[] {
  const A = a.split(/(\s+)/).filter(Boolean);
  const B = b.split(/(\s+)/).filter(Boolean);
  if (A.length * B.length > MAX_CELLS) {
    return [...(a ? [{ t: 'del' as const, text: a }] : []), ...(b ? [{ t: 'add' as const, text: b }] : [])];
  }
  const n = A.length, m = B.length;
  const L: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);

  const out: Seg[] = [];
  const push = (t: Seg['t'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.t === t) last.text += text;
    else out.push({ t, text });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push('same', A[i]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) push('del', A[i++]);
    else push('add', B[j++]);
  }
  while (i < n) push('del', A[i++]);
  while (j < m) push('add', B[j++]);
  return out;
}
