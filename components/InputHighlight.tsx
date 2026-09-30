import React, { FC } from 'react';
import { Cluster, sourceRuns, Color } from '../lib/compressor';

const MARK: Record<Color, string> = {
  green: 'bg-emerald-500/40',
  orange: 'bg-orange-500/40',
  blue: 'bg-sky-500/40',
  purple: 'bg-purple-500/40',
  red: 'bg-red-500/40',
};

// Sits BEHIND the transparent-background textarea, so the user's own text is colored in place.
// Everything that affects text layout (font, padding, border, wrapping) must match the textarea exactly,
// otherwise the colors drift off the words. That is why the marks carry no padding.
export const InputHighlight: FC<{ text: string; clusters: Cluster[]; active: number | null }> = ({ text, clusters, active }) => (
  <div aria-hidden data-testid="input-highlight"
       className="absolute inset-0 border border-transparent rounded-lg p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words text-transparent pointer-events-none overflow-hidden">
    {sourceRuns(text, clusters).map((r, i) => r.cluster < 0
      ? <span key={i}>{r.text}</span>
      : <mark key={i} data-cluster={r.cluster} data-color={clusters[r.cluster].color_theme}
              className={`text-transparent rounded-sm transition-opacity ${MARK[clusters[r.cluster].color_theme]} ${active !== null && active !== r.cluster ? 'opacity-20' : ''}`}>{r.text}</mark>)}
  </div>
);
