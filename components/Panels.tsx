import React, { FC, useState } from 'react';
import { LlmConfig, loadLlmConfig, saveLlmConfig, modelLabel } from '../lib/llmConfig';
import { fetchClaudeModels, ModelGroup } from '../lib/llmClient';
import { CustomMode, makeCustomMode, parseCustomModes, serializeCustomModes } from '../lib/customModes';
import { wordDiff } from '../lib/diff';
import { parseCompressed, sourceRuns, coverage, overlapRatio, mirrorRatio, Color } from '../lib/compressor';

const box = 'mt-3 p-4 bg-slate-950/60 rounded-xl border border-slate-800 text-xs space-y-2';
const inp = 'w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-mono';
const btn = 'px-3 py-1 rounded-full border border-slate-700 bg-slate-800 text-slate-300 hover:text-white';

export const ModelSettings: FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const [c, setC] = useState<LlmConfig>(() => loadLlmConfig(localStorage));
  const [msg, setMsg] = useState('');
  const [groups, setGroups] = useState<ModelGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof LlmConfig) => (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: e.target.value });
  const claude = c.provider === 'claude';

  const fetchModels = async () => {
    setBusy(true); setMsg('Loading models...');
    try {
      const g = await fetchClaudeModels(c.claudeKey);
      setGroups(g);
      // keep the current choice if still offered, else default to the first (newest Opus/Sonnet/Haiku entry)
      const all = g.flatMap(x => x.models.map(m => m.id));
      if (!all.includes(c.claudeModel)) setC(prev => ({ ...prev, claudeModel: all[0] }));
      setMsg(`${all.length} models loaded.`);
    } catch (e: any) {
      setGroups([]); setMsg(String(e.message || e));
    } finally { setBusy(false); }
  };

  return (
    <div className={box} data-testid="model-settings">
      <div className="font-bold uppercase tracking-wider text-slate-500">Model</div>
      <div className="flex gap-2">
        <button aria-label="Use Bonsai" className={btn + (!claude ? ' !bg-indigo-600 !text-white' : '')} onClick={() => setC({ ...c, provider: 'local' })}>Bonsai (local)</button>
        <button aria-label="Use Claude" className={btn + (claude ? ' !bg-indigo-600 !text-white' : '')} onClick={() => setC({ ...c, provider: 'claude' })}>Claude</button>
      </div>
      {!claude && (<>
        <input aria-label="Base URL" className={inp} value={c.baseUrl} onChange={set('baseUrl')} placeholder="/llm/v1 or http://localhost:11434/v1" />
        <input aria-label="Model" className={inp} value={c.model} onChange={set('model')} placeholder="model name" />
        <input aria-label="API key" className={inp} value={c.apiKey} onChange={set('apiKey')} placeholder="API key (optional)" type="password" />
      </>)}
      {claude && (<>
        <input aria-label="Claude API key" className={inp} value={c.claudeKey} onChange={set('claudeKey')} placeholder="Claude API key (sk-ant-...)" type="password" />
        <div className="flex gap-2 items-center">
          <button className={btn} disabled={busy} onClick={fetchModels}>Load models</button>
          <select aria-label="Claude model" className={inp} value={c.claudeModel} onChange={e => setC({ ...c, claudeModel: e.target.value })}>
            {!groups.length && <option value={c.claudeModel}>{c.claudeModel || 'Press Load models'}</option>}
            {groups.map(g => (
              <optgroup key={g.family} label={g.family}>
                {g.models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="text-slate-500">Key is stored in this browser only and sent to Anthropic via the local dev server.</div>
      </>)}
      <div className="flex items-center gap-3">
        <button className={btn} onClick={() => {
          const r = saveLlmConfig(localStorage, c);
          setMsg(r.ok === false ? r.error : `Saved. Using ${modelLabel(c)}`);
          if (r.ok) onSaved();
        }}>Save</button>
        <span data-testid="model-msg" className="text-slate-400">{msg}</span>
      </div>
    </div>
  );
};

export const ModesManager: FC<{ modes: CustomMode[]; onChange: (m: CustomMode[]) => void }> = ({ modes, onChange }) => {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [prompt, setPrompt] = useState('');
  const [msg, setMsg] = useState('');
  const [io, setIo] = useState('');
  return (
    <div className={box} data-testid="modes-manager">
      <div className="font-bold uppercase tracking-wider text-slate-500">Custom modes</div>
      <div className="flex gap-2">
        <input aria-label="Mode name" className={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Name" />
        <input aria-label="Mode emoji" className={inp + ' !w-16'} value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="✨" />
      </div>
      <textarea aria-label="Mode prompt" className={inp} rows={3} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Instruction. Use {{text}} where the input goes." />
      <div className="flex items-center gap-3">
        <button className={btn} onClick={() => {
          const r = makeCustomMode(name, emoji, prompt, modes);
          if (r.ok === false) return setMsg(r.error);
          onChange([...modes, r.mode]); setName(''); setEmoji(''); setPrompt(''); setMsg('Added.');
        }}>Add mode</button>
        <button className={btn} onClick={() => setIo(serializeCustomModes(modes))}>Export JSON</button>
        <button className={btn} onClick={() => {
          const r = parseCustomModes(io);
          if (r.ok === false) return setMsg(r.error);
          onChange(r.modes); setMsg(`Imported ${r.modes.length}.`);
        }}>Import JSON</button>
        <span data-testid="modes-msg" className="text-slate-400">{msg}</span>
      </div>
      <textarea aria-label="Modes JSON" className={inp} rows={3} value={io} onChange={e => setIo(e.target.value)} placeholder="Export writes here. Paste JSON and press Import." />
      {modes.map(m => (
        <div key={m.id} className="flex justify-between text-slate-400">
          <span>{m.emoji} {m.name}</span>
          <button className="text-red-400" onClick={() => onChange(modes.filter(x => x.id !== m.id))}>remove</button>
        </div>
      ))}
    </div>
  );
};

export const DiffView: FC<{ before: string; after: string }> = ({ before, after }) => (
  <div data-testid="diff-view" className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-slate-300">
    {wordDiff(before, after).map((s, i) =>
      s.t === 'same' ? <span key={i}>{s.text}</span>
      : s.t === 'add' ? <ins key={i} className="bg-emerald-500/20 text-emerald-300 no-underline">{s.text}</ins>
      : <del key={i} className="bg-red-500/20 text-red-300">{s.text}</del>
    )}
  </div>
);

const THEME: Record<Color, { card: string; mark: string; dot: string }> = {
  green:  { card: 'border-emerald-500/40 bg-emerald-500/10', mark: 'bg-emerald-500/30', dot: 'bg-emerald-400' },
  orange: { card: 'border-orange-500/40 bg-orange-500/10',   mark: 'bg-orange-500/30',  dot: 'bg-orange-400' },
  blue:   { card: 'border-sky-500/40 bg-sky-500/10',         mark: 'bg-sky-500/30',     dot: 'bg-sky-400' },
  purple: { card: 'border-purple-500/40 bg-purple-500/10',   mark: 'bg-purple-500/30',  dot: 'bg-purple-400' },
  red:    { card: 'border-red-500/40 bg-red-500/10',         mark: 'bg-red-500/30',     dot: 'bg-red-400' },
};

export const ClusterView: FC<{ raw: string; source: string; active?: number | null; onActive?: (i: number | null) => void }> = ({ raw, source, active: activeProp, onActive }) => {
  const [inner, setInner] = useState<number | null>(null);
  const active = activeProp !== undefined ? activeProp : inner;
  const setActive = onActive ?? setInner;
  let parsed;
  try { parsed = parseCompressed(raw, source); } catch (e: any) {
    return <div className="text-red-400 text-xs font-mono">Could not read clusters: {String(e.message || e)}</div>;
  }
  const { clusters, dropped } = parsed;
  const runs = sourceRuns(source, clusters);
  const cov = Math.round(coverage(source, clusters) * 100);
  const ovl = Math.round(overlapRatio(source, clusters) * 100);
  const mir = Math.round(mirrorRatio(source, clusters) * 100);
  const dim = (i: number) => active !== null && active !== i;
  return (
    <div data-testid="cluster-view" className="space-y-3 text-sm">
      <div className="text-[10px] font-mono text-slate-500" data-testid="cluster-stats">
        {clusters.length} clusters · {cov}% of source mapped
        {ovl ? ` · ${ovl}% claimed by 2+ clusters (colors uncertain)` : ''}
        {mir ? ` · ${mir}% of keywords repeat the source wording` : ''}
        {dropped ? ` · ${dropped} invalid range(s) ignored` : ''}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Layer 1: colored core text (small type) */}
        <div className="flex-1 min-w-0 space-y-3">
          {clusters.map((c, i) => (
            <div key={i} data-testid={`cluster-${i}`} data-color={c.color_theme}
                 onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
                 className={`rounded-lg border p-3 transition ${THEME[c.color_theme].card} ${active === i ? 'ring-1 ring-white/30' : dim(i) ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-2 mb-1 text-[10px] uppercase tracking-wider text-slate-400">
                <span className={`w-2 h-2 rounded-full ${THEME[c.color_theme].dot}`} />{c.color_theme} · {c.source_byte_ranges.length} range(s)
              </div>
              <div className="text-slate-300 text-[13px] leading-relaxed whitespace-pre-wrap">{c.rewritten_text}</div>
            </div>
          ))}
        </div>

        {/* Layer 2: universal keywords (large, bold, separate side panel) */}
        <aside data-testid="keyword-panel" aria-label="Universal keywords"
               className="lg:w-44 lg:flex-none lg:sticky lg:top-0 self-start rounded-xl border border-slate-700 bg-slate-950/70 p-3 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Universal keywords</div>
          {clusters.map((c, i) => (
            <div key={i} data-testid={`kw-group-${i}`} data-color={c.color_theme}
                 onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
                 className={`flex flex-wrap gap-2 transition ${dim(i) ? 'opacity-40' : ''}`}>
              {c.universal_keywords.map(k => (
                <span key={k} data-testid="kw-chip"
                      className={`px-3 py-1.5 rounded-full border text-base font-extrabold tracking-tight text-white ${THEME[c.color_theme].card}`}>
                  {k}
                </span>
              ))}
            </div>
          ))}
        </aside>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Source (hover a cluster)</div>
        <div data-testid="source-map" className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-400 bg-black/20 rounded p-3">
          {runs.map((r, i) => r.cluster < 0
            ? <span key={i}>{r.text}</span>
            : <mark key={i} data-cluster={r.cluster}
                    className={`text-slate-100 rounded-sm px-0.5 transition ${THEME[clusters[r.cluster].color_theme].mark} ${dim(r.cluster) ? 'opacity-30' : ''}`}>{r.text}</mark>)}
        </div>
      </div>
    </div>
  );
};
