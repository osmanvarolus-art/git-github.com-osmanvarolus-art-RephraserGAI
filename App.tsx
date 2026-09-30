
import React, { useState, useEffect, useCallback, useMemo, FC, useRef, useLayoutEffect } from 'react';
import { PERSONAS } from './constants';
import { rephraseText, TuningParams } from './services/geminiService';
import { ModelSettings, ModesManager, DiffView, ClusterView } from './components/Panels';
import { InputHighlight } from './components/InputHighlight';
import { parseCompressed } from './lib/compressor';
import { CustomMode, loadCustomModes, saveCustomModes } from './lib/customModes';
import { loadLlmConfig, modelLabel } from './lib/llmConfig';
import { formatOwnerContext, loadOwnerContext, updateOwnerContext, type OwnerContext } from './lib/ownerContext';

type ActivityItem = { source: string; time: string; text: string; threadTitle?: string; status?: string; threadId?: string };
type ActivityJob = { source: string; key: string; version: number; manual: boolean; level: 5 | 10; tuning: TuningParams; config: ReturnType<typeof loadLlmConfig> };

function localAutoTarget(baseUrl: string): boolean {
  if (baseUrl === '/llm/v1') return true;
  try {
    const target = new URL(baseUrl);
    return ['http:', 'https:'].includes(target.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) && !target.username && !target.password;
  } catch { return false; }
}

function activityFingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${hash >>> 0}`;
}

// --- Icon Components ---
const SparklesIcon: FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className || "w-5 h-5"}>
    <path fillRule="evenodd" d="M10.868 2.884c.321-.772 1.415-.772 1.736 0l1.681 4.06c.064.155.195.286.35.35l4.06 1.681c.772.321.772 1.415 0 1.736l-4.06 1.681a.604.604 0 00-.35.35l-1.681 4.06c-.321.772-1.415-.772-1.736 0l-1.681-4.06a.604.604 0 00-.35-.35l-4.06-1.681c-.772-.321-.772-1.415 0-1.736l4.06-1.681a.604.604 0 00.35.35l1.681-4.06zM9.128 15.463c.271.654 1.205.654 1.476 0l1.097-2.653c.054-.13.154-.23.284-.284l2.653-1.097c.654-.271.654-1.205 0-1.476l-2.653-1.097a.468.468 0 00-.284-.284l-1.097-2.653c-.271-.654-1.205-.654-1.476 0l-1.097 2.653a.468.468 0 00-.284.284l-2.653 1.097c-.654.271-.654 1.205 0 1.476l2.653 1.097c.13.054.23.154.284.284l1.097 2.653z" clipRule="evenodd" />
  </svg>
);
const ClipboardIcon: FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-6 h-6"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a2.25 2.25 0 01-2.25 2.25h-1.5a2.25 2.25 0 01-2.25-2.25v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
  </svg>
);
const CheckIcon: FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-6 h-6"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);
const BrainIcon: FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className || "w-5 h-5"}>
    <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
  </svg>
);
const AdjustmentsIcon: FC<{ className?: string }> = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className || "w-5 h-5"}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 13.5V3.75m0 9.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 3.75V16.5m12-3V3.75m0 9.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 3.75V16.5m-6-9V3.75m0 3.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 9.75V10.5" />
  </svg>
);

// --- UI Components ---
interface PersonaSelectorProps {
  selectedPersona: string;
  onExecute: (personaId: string) => void;
  isLoading: boolean;
}
const PersonaSelector: FC<PersonaSelectorProps & { extra?: CustomMode[] }> = ({ selectedPersona, onExecute, isLoading, extra = [] }) => {
  const highValueIds = ['executive-brief', 'legal-shield', 'legacy-refactor', 'medical-claim', 'semantic-dna', 'brainstorming'];

  return (
    <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {[...PERSONAS, ...extra].map((persona) => {
        const isHighValue = highValueIds.includes(persona.id);
        const isSelected = selectedPersona === persona.id;
        
        return (
          <button
            key={persona.id}
            onClick={() => onExecute(persona.id)}
            disabled={isLoading}
            className={`shrink-0 px-2.5 py-1 text-xs font-medium whitespace-nowrap rounded-full flex items-center transition-all duration-200 border disabled:opacity-50 disabled:cursor-not-allowed ${
              isSelected
                ? isHighValue 
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border-orange-500 shadow-lg shadow-orange-500/30'
                  : 'bg-indigo-600 text-white border-indigo-500'
                : isHighValue
                  ? 'bg-slate-800 text-amber-400 border-amber-900/50 hover:bg-slate-700 hover:border-amber-700 hover:scale-105 active:scale-95'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:border-slate-600 hover:scale-105 active:scale-95'
            }`}
          >
            <span className="mr-1.5">{persona.emoji}</span>
            {persona.id === 'agent-activity' ? 'Read & Explain' : persona.name}
          </button>
        );
      })}
    </div>
  );
};

interface TuningSliderProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  leftLabel: string;
  rightLabel: string;
}
const TuningSlider: FC<TuningSliderProps> = ({ label, value, onChange, leftLabel, rightLabel }) => (
  <div className="w-full">
    <div className="flex justify-between items-center mb-1">
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</label>
      <span className="text-xs font-mono text-indigo-400">{value}%</span>
    </div>
    <input
      type="range"
      min="0"
      max="100"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
    />
    <div className="flex justify-between items-center mt-1 text-[10px] text-slate-600">
      <span>{leftLabel}</span>
      <span>{rightLabel}</span>
    </div>
  </div>
);

// --- Main App Component ---
export default function App() {
  const [inputText, setInputText] = useState<string>('');
  const [resultText, setResultText] = useState<string>('');
  const [selectedPersona, setSelectedPersona] = useState<string>(() => new URLSearchParams(window.location.search).get('mode') === 'agent-activity' ? 'agent-activity' : PERSONAS[0].id);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<boolean>(false);
  const [showTuner, setShowTuner] = useState<boolean>(false);
  const [tuning, setTuning] = useState<TuningParams>({ granularity: 50, risk: 50, assertiveness: 50 });
  const [customModes, setCustomModes] = useState<CustomMode[]>(() => loadCustomModes(localStorage));
  const [panel, setPanel] = useState<'' | 'model' | 'modes'>('');
  const [showDiff, setShowDiff] = useState<boolean>(false);
  const [runInfo, setRunInfo] = useState<{ model: string; secs: number } | null>(null);
  const [resultSource, setResultSource] = useState<string>(''); // the exact text the result was computed from
  const [activeCluster, setActiveCluster] = useState<number | null>(null); // hovered cluster, shared by input, cards and chips
  const [codexThreads, setCodexThreads] = useState<{ id: string; title: string; updatedAt: string }[]>([]);
  const [codexThreadId, setCodexThreadId] = useState('');
  const [activitySourceMode, setActivitySourceMode] = useState<'all' | 'herdr' | 'codex'>('all');
  const [activityLevel, setActivityLevel] = useState<5 | 10>(10);
  const [activityText, setActivityText] = useState('');
  const [activityScope, setActivityScope] = useState('All recent Codex threads');
  const [ownerContext, setOwnerContext] = useState<OwnerContext>(() => loadOwnerContext(localStorage));
  const ownerContextRef = useRef(ownerContext);
  ownerContextRef.current = ownerContext;
  const [activityNotice, setActivityNotice] = useState('Waiting for local activity');
  const [lastActivityAt, setLastActivityAt] = useState('');
  const [modelConfigRevision, setModelConfigRevision] = useState(0);
  const selectedPersonaRef = useRef(selectedPersona);
  selectedPersonaRef.current = selectedPersona;
  const activityReadInFlight = useRef(false);
  const activityReadQueued = useRef(false);
  const activityReadGeneration = useRef(0);
  const refreshActivityRef = useRef<((manual?: boolean) => Promise<boolean>) | null>(null);
  const activitySummaryInFlight = useRef(false);
  const activeSummaryKey = useRef('');
  const activityVersion = useRef(0);
  const latestActivityFingerprint = useRef('');
  const lastSummaryKey = useRef('');
  const summaryRetry = useRef<{ key: string; count: number; retryAt: number }>({ key: '', count: 0, retryAt: 0 });
  const pendingSummary = useRef<ActivityJob | null>(null);
  const debounceTimer = useRef<number | null>(null);
  const localModelStatus = useRef<{ checkedAt: number; reachable: boolean; models: string[] }>({ checkedAt: 0, reachable: false, models: [] });

  const updateModes = (m: CustomMode[]) => { setCustomModes(m); saveCustomModes(localStorage, m); };

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const displayedInput = selectedPersona === 'agent-activity' ? activityText : inputText;

  const refreshCodexThreads = useCallback(async () => {
    try {
      const response = await fetch('/api/codex/threads');
      if (!response.ok) throw new Error('Codex history is unavailable from this local app session.');
      const data = await response.json();
      setCodexThreads(data.threads);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Codex history is unavailable.');
    }
  }, []);

  useEffect(() => { void refreshCodexThreads(); }, [refreshCodexThreads]);

  useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const height = selectedPersona === 'agent-activity' ? Math.min(textarea.scrollHeight, 420) : textarea.scrollHeight;
      textarea.style.height = `${height}px`;
      textarea.style.overflowY = selectedPersona === 'agent-activity' && textarea.scrollHeight > height ? 'auto' : 'hidden';
    }
  }, [displayedInput, selectedPersona]);

  const explainActivity = useCallback(async (job: ActivityJob) => {
    if (job.version !== activityVersion.current || selectedPersonaRef.current !== 'agent-activity') return;
    if (!job.manual && (job.key === lastSummaryKey.current || job.key === activeSummaryKey.current)) return;
    if (activitySummaryInFlight.current) {
      if (pendingSummary.current?.key !== job.key) pendingSummary.current = job;
      return;
    }
    activitySummaryInFlight.current = true;
    activeSummaryKey.current = job.key;
    const cfg = job.config;
    const label = modelLabel(cfg);
    const startedAt = Date.now();
    setIsLoading(true);
    setActivityNotice(job.manual ? 'Explaining…' : 'Updating explanation…');
    setError(null);
    try {
      const result = await rephraseText(job.source, `agent-activity-${job.level}`, job.tuning, cfg);
      if (job.version !== activityVersion.current || selectedPersonaRef.current !== 'agent-activity') return;
      setResultSource(job.source);
      setResultText(result);
      setRunInfo({ model: label, secs: (Date.now() - startedAt) / 1000 });
      lastSummaryKey.current = job.key;
      summaryRetry.current = { key: job.key, count: 0, retryAt: 0 };
      setActivityNotice(`Live · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    } catch (err: any) {
      if (job.version === activityVersion.current) {
        const previous = summaryRetry.current;
        const count = previous.key === job.key ? previous.count + 1 : 1;
        summaryRetry.current = { key: job.key, count, retryAt: Date.now() + Math.min(20000 * (2 ** (count - 1)), 120000) };
        setError(err.message || 'Local explanation failed.');
        setActivityNotice(count >= 3 ? 'Explanation failed · refresh or wait for new activity' : `Explanation error · retry ${count}/3 with backoff`);
      }
    } finally {
      activitySummaryInFlight.current = false;
      activeSummaryKey.current = '';
      setIsLoading(false);
      const pending = pendingSummary.current;
      pendingSummary.current = null;
      if (pending && pending.version === activityVersion.current && selectedPersonaRef.current === 'agent-activity') {
        debounceTimer.current = window.setTimeout(() => void explainActivity(pending), 500);
      }
    }
  }, []);

  const refreshActivity = useCallback(async (manual = false): Promise<boolean> => {
    if (activityReadInFlight.current) { activityReadQueued.current = true; return false; }
    activityReadInFlight.current = true;
    const readGeneration = activityReadGeneration.current;
    setActivityNotice(manual ? 'Reading sources…' : 'Checking sources…');
    try {
      const codexResponse = await fetch('/api/codex/activity', { cache: 'no-store' });
      const codex = codexResponse.ok ? await codexResponse.json() : null;
      if (readGeneration !== activityReadGeneration.current) return false;
      if (!codex && activitySourceMode !== 'herdr') throw new Error('Codex history is unavailable from this local app session.');
      let currentContext = ownerContextRef.current;
      if (codex?.ownerContext) {
        currentContext = updateOwnerContext(localStorage, codex.ownerContext.goals, codex.ownerContext.coverage);
        ownerContextRef.current = currentContext;
        setOwnerContext(currentContext);
      }

      let items: ActivityItem[] = [];
      let statuses: { title: string; status: string; updatedAt: string }[] = [];
      let scope = '';
      if (activitySourceMode === 'herdr') {
        const response = await fetch('/api/herdr/activity', { cache: 'no-store' });
        if (!response.ok) throw new Error('Herdr live activity is unavailable.');
        const herdr = await response.json();
        if (readGeneration !== activityReadGeneration.current) return false;
        items = herdr.items;
        scope = `Herdr live panes · ${herdr.agents.length} agents`;
      } else if (activitySourceMode === 'codex' && codexThreadId) {
        const response = await fetch(`/api/codex/threads/${encodeURIComponent(codexThreadId)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('The selected Codex thread is unavailable.');
        const thread = await response.json();
        if (readGeneration !== activityReadGeneration.current) return false;
        items = thread.items;
        statuses = [{ title: thread.title, status: thread.status, updatedAt: thread.updatedAt }];
        scope = `Codex thread “${thread.title}” · ${thread.status}`;
      } else {
        items = codex.items;
        statuses = codex.threads;
        scope = `Recent Codex threads · ${codex.threads.length} threads`;
        if (activitySourceMode === 'all') {
          const response = await fetch('/api/herdr/activity', { cache: 'no-store' });
          if (response.ok) {
            const herdr = await response.json();
            if (readGeneration !== activityReadGeneration.current) return false;
            items = [...items, ...herdr.items].sort((a, b) => String(a.time).localeCompare(String(b.time)));
            scope = `Recent Codex threads + ${herdr.agents.length} Herdr panes`;
          } else scope += ' · Herdr unavailable';
        }
      }
      if (readGeneration !== activityReadGeneration.current) return false;
      const context = currentContext;
      const sourceHeader = `Source: ${scope}. Read-only attributed activity.\n${formatOwnerContext(context)}`;
      const records = items.slice(-180).map(item => `[${item.time || 'source time unavailable'}] ${item.threadTitle ? `${item.threadTitle} · ${item.status ?? 'unknown'} · ` : ''}${item.source}: ${item.text}`);
      const selectedRecords: string[] = [];
      let sourceChars = sourceHeader.length;
      for (const record of records.reverse()) {
        if (sourceChars + record.length + 2 > 36000) continue;
        selectedRecords.unshift(record);
        sourceChars += record.length + 2;
      }
      const source = `${sourceHeader}\n\n${selectedRecords.join('\n\n')}`;
      const provider = loadLlmConfig(localStorage);
      const semantic = {
        scope,
        statuses: statuses.map(row => [row.title, row.status, row.updatedAt]),
        items: items.map(item => [item.threadId, item.threadTitle, item.status, item.source, item.time, item.text]),
        goals: context.goals.map(goal => [goal.id, goal.time, goal.text, goal.correction]),
        goalCoverage: [context.coverage.indexedThreadsChecked, context.coverage.maxIndexedThreads, context.coverage.historyWindow],
        level: activityLevel,
        provider: provider.provider,
        model: provider.provider === 'local' ? provider.model : provider.claudeModel,
      };
      const fingerprint = activityFingerprint(semantic);
      const changed = fingerprint !== latestActivityFingerprint.current;
      if (changed) {
        latestActivityFingerprint.current = fingerprint;
        activityVersion.current++;
      }
      setActivityScope(scope);
      setActivityText(source);
      setLastActivityAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      if (!items.length && !context.goals.length) {
        setActivityNotice('No readable activity or goal evidence in checked sources');
        return true;
      }
      const version = activityVersion.current;
      const key = `${fingerprint}:${activityLevel}:${semantic.provider}:${semantic.model}`;
      if (manual) {
        if (!changed) activityVersion.current++;
        const forceVersion = activityVersion.current;
        await explainActivity({ source, key, version: forceVersion, manual: true, level: activityLevel, tuning: { ...tuning }, config: { ...provider } });
        return true;
      }
      if (key === lastSummaryKey.current) {
        setActivityNotice(`Live · checked ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        return true;
      }
      if (summaryRetry.current.key === key && summaryRetry.current.count >= 3) {
        setActivityNotice('Explanation failed · refresh or wait for new activity');
        return true;
      }
      if (summaryRetry.current.key === key && Date.now() < summaryRetry.current.retryAt) {
        setActivityNotice('Sources live · waiting for bounded local retry');
        return true;
      }
      if (provider.provider !== 'local' || !localAutoTarget(provider.baseUrl) || provider.baseUrl !== '/llm/v1') {
        setActivityNotice(`Sources live · auto explanation needs verified local Bonsai (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
        return true;
      }
      let ready = localModelStatus.current;
      if (Date.now() - ready.checkedAt > 30000) {
        const response = await fetch('/api/local-model/status', { cache: 'no-store' });
        const data = response.ok ? await response.json() : { reachable: false, models: [] };
        ready = { checkedAt: Date.now(), reachable: !!data.reachable, models: Array.isArray(data.models) ? data.models : [] };
        localModelStatus.current = ready;
      }
      if (!ready.reachable || !ready.models.includes(provider.model)) {
        setActivityNotice('Sources live · verified local model unavailable');
        return true;
      }
      setActivityNotice(`New activity · explaining with local model`);
      if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current);
      const job: ActivityJob = { source, key, version, manual: false, level: activityLevel, tuning: { ...tuning }, config: { ...provider } };
      debounceTimer.current = window.setTimeout(() => void explainActivity(job), 1800);
      return true;
    } catch (err: any) {
      if (readGeneration === activityReadGeneration.current) {
        setError(err.message || 'Could not refresh local activity.');
        setActivityNotice('Source error · retrying with backoff');
      }
      return false;
    } finally {
      activityReadInFlight.current = false;
      if (activityReadQueued.current) {
        activityReadQueued.current = false;
        window.setTimeout(() => { void refreshActivityRef.current?.(false); }, 0);
      }
    }
  }, [activitySourceMode, codexThreadId, activityLevel, explainActivity]);
  refreshActivityRef.current = refreshActivity;

  useEffect(() => {
    if (selectedPersona !== 'agent-activity') return;
    let stopped = false;
    let timer = 0;
    let delay = 20000;
    const poll = async () => {
      const ok = await refreshActivity(false);
      if (stopped) return;
      delay = ok ? 20000 : Math.min(delay * 2, 120000);
      timer = window.setTimeout(poll, delay);
    };
    void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      activityReadGeneration.current++;
      if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current);
      pendingSummary.current = null;
      activityVersion.current++;
    };
  }, [selectedPersona, refreshActivity, modelConfigRevision]);

  const handleRephrase = useCallback(async (personaId: string) => {
    if (isLoading || activitySummaryInFlight.current) return;
    selectedPersonaRef.current = personaId;
    setSelectedPersona(personaId);
    if (personaId === 'agent-activity') {
      setShowDiff(false);
      setIsLoading(true);
      void refreshActivity(true).finally(() => setIsLoading(false));
      return;
    }
    activityVersion.current++;
    if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current);
    if (!inputText.trim()) {
      setError('Input payload empty. Initiate data stream.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setResultText('');
    setActiveCluster(null);
    try {
      setResultSource(inputText);
      const label = modelLabel(loadLlmConfig(localStorage));
      const t0 = Date.now();
      const rephrased = await rephraseText(inputText, personaId, tuning);
      setResultText(rephrased);
      setRunInfo({ model: label, secs: (Date.now() - t0) / 1000 });
    } catch (err: any) {
      setError(err.message || 'Neural link interrupted.');
    } finally { setIsLoading(false); }
  }, [inputText, tuning, refreshActivity, isLoading]);

  const handleCopy = () => {
    if (!resultText) return;
    navigator.clipboard.writeText(resultText);
    setCopyStatus(true);
    setTimeout(() => setCopyStatus(false), 2000);
  };

  // Cluster colors are only valid for the exact text they were computed from; editing the input clears them.
  const compressed = useMemo(() => {
    if (selectedPersona !== 'knowledge-compressor' || !resultText || isLoading) return null;
    try { return parseCompressed(resultText, resultSource); } catch { return null; }
  }, [selectedPersona, resultText, resultSource, isLoading]);
  const showInputHighlight = !!compressed && inputText === resultSource;
  const isThinkingAgent = ['executive-brief', 'legal-shield', 'legacy-refactor', 'medical-claim', 'semantic-dna', 'brainstorming'].includes(selectedPersona);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 antialiased relative selection:bg-indigo-500/30">
      {/* Background Gradient Orb */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-96 bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none -z-10"></div>

      <main className="w-full px-3 py-3 sm:px-5 sm:py-4">
        <header className="flex items-center gap-3 mb-3">
            <div className="inline-flex shrink-0 items-center gap-2 px-2 py-1 rounded-full bg-slate-900 border border-slate-800">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-medium text-slate-400 tracking-wide uppercase">System Operational</span>
            </div>
            <h1 className="text-lg sm:text-xl font-black text-white tracking-tight whitespace-nowrap">
              Nexys <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 font-light">Prime</span>
            </h1>
        </header>
        
        <div className="w-full bg-slate-900/80 backdrop-blur-2xl border border-slate-800 rounded-xl shadow-2xl shadow-black/50 overflow-hidden ring-1 ring-white/5">
            <div className="border-b border-slate-800 bg-slate-900/50">
                <div className="flex w-full min-w-0 items-center gap-2 overflow-x-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <h3 className="shrink-0 text-xs font-bold uppercase tracking-wider text-slate-500">Protocol</h3>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isThinkingAgent && (
                      <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs text-amber-300">
                        <BrainIcon className="w-3 h-3" />
                        <span>Deep Reasoning</span>
                      </div>
                    )}
                    <button
                      onClick={() => setPanel(panel === 'modes' ? '' : 'modes')}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${panel === 'modes' ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                    >
                      My Modes
                    </button>
                    <button
                      onClick={() => setPanel(panel === 'model' ? '' : 'model')}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${panel === 'model' ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                    >
                      Model
                    </button>
                    <button 
                      onClick={() => setShowTuner(!showTuner)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${showTuner ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                    >
                      <AdjustmentsIcon className="w-3 h-3" />
                      Tune Reality
                    </button>
                  </div>
                
                <div className="min-w-[260px] flex-1 overflow-x-auto">
                     <PersonaSelector selectedPersona={selectedPersona} onExecute={handleRephrase} isLoading={isLoading} extra={customModes} />
                </div>
                </div>
                {selectedPersona === 'agent-activity' && (
                       <div className="flex min-w-0 items-center gap-2 border-t border-slate-800 px-3 py-2">
                         <label htmlFor="codex-thread" className="shrink-0 text-xs text-slate-400">Source</label>
                         <select id="codex-thread" value={codexThreadId || activitySourceMode} onChange={e => {
                           if (e.target.value === 'all' || e.target.value === 'herdr' || e.target.value === 'codex') { setCodexThreadId(''); setActivitySourceMode(e.target.value); }
                           else { setCodexThreadId(e.target.value); setActivitySourceMode('codex'); }
                         }} className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200">
                           <option value="all">All active/recent streams (Codex + Herdr)</option>
                           <option value="herdr">Herdr live panes</option>
                           <option value="codex">All recent Codex threads</option>
                           {codexThreads.map(thread => <option key={thread.id} value={thread.id}>{thread.title} · {new Date(thread.updatedAt).toLocaleString()}</option>)}
                         </select>
                         <button onClick={() => { void refreshCodexThreads(); void refreshActivity(true); }} className="shrink-0 rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-400 hover:text-white">Refresh</button>
                         <div role="group" aria-label="Explanation level" className="inline-flex shrink-0 rounded-md border border-slate-700 p-0.5">
                           {[5, 10].map(level => <button key={level} aria-pressed={activityLevel === level} onClick={() => setActivityLevel(level as 5 | 10)} className={`rounded px-2 py-1 text-xs ${activityLevel === level ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-400'}`}>{level === 5 ? 'Age 5' : 'Age 10'}</button>)}
                         </div>
                       </div>
                     )}
                {selectedPersona === 'agent-activity' && <p className="px-3 pb-2 text-[11px] text-slate-500" aria-live="polite">{activityScope || 'Activity sources'} · {activityNotice}{lastActivityAt ? ` · source checked ${lastActivityAt}` : ''} · goal context: {ownerContext.coverage?.indexedThreadsChecked ?? 0}/{ownerContext.coverage?.maxIndexedThreads ?? 40} indexed Codex tasks</p>}
                <div className="px-3">
                     {panel === 'model' && <ModelSettings onSaved={() => { setError(null); setModelConfigRevision(value => value + 1); }} />}
                     {panel === 'modes' && <ModesManager modes={customModes} onChange={updateModes} />}
                </div>
                  
                  {showTuner && (
                    <div className="md:w-64 flex-shrink-0 p-4 bg-slate-950/50 rounded-xl border border-slate-800/50 animate-in slide-in-from-top-2 fade-in duration-200">
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-3">Reality Tuning Levers</h4>
                      <div className="space-y-4">
                        <TuningSlider 
                          label="Granularity" 
                          value={tuning.granularity} 
                          onChange={(v) => setTuning(p => ({...p, granularity: v}))} 
                          leftLabel="Simple" 
                          rightLabel="Technical"
                        />
                        <TuningSlider 
                          label="Risk Tolerance" 
                          value={tuning.risk} 
                          onChange={(v) => setTuning(p => ({...p, risk: v}))} 
                          leftLabel="Safe" 
                          rightLabel="Gamble"
                        />
                         <TuningSlider 
                          label="Assertiveness" 
                          value={tuning.assertiveness} 
                          onChange={(v) => setTuning(p => ({...p, assertiveness: v}))} 
                          leftLabel="Passive" 
                          rightLabel="Dominant"
                        />
                      </div>
                    </div>
                  )}
                {error && <p className="mt-4 text-red-400 text-xs font-mono bg-red-950/30 px-3 py-1 rounded border border-red-900/50 text-center sm:text-left">{error}</p>}
            </div>

            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
                {/* Input Column */}
                <div className="p-4 flex flex-col h-full">
                    <div className="flex justify-between items-center mb-3">
                        <label htmlFor="inputText" className="font-semibold text-white flex items-center gap-2">
                          Input Data
                        </label>
                        <span className="text-xs font-mono text-slate-500">{displayedInput.length} chars</span>
                    </div>
                    <div className="relative rounded-lg bg-slate-950">
                        {showInputHighlight && compressed && (
                            <InputHighlight text={resultSource} clusters={compressed.clusters} active={activeCluster} />
                        )}
                        <textarea
                            id="inputText"
                            ref={inputRef}
                            value={displayedInput}
                            readOnly={selectedPersona === 'agent-activity'}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder={selectedPersona === 'agent-activity' ? 'Choose a Codex thread and select Agent Activity to read it...' : isThinkingAgent ? "Paste complex documentation, legal contracts, or legacy code here..." : "Enter text to process..."}
                            maxLength={15000}
                            className="relative w-full min-h-[300px] bg-transparent border border-slate-800 rounded-lg p-4 resize-none overflow-y-hidden focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none transition text-slate-300 font-mono text-sm leading-relaxed placeholder:text-slate-700"
                        />
                    </div>
                    {showInputHighlight && (
                        <p data-testid="input-highlight-hint" className="mt-2 text-[10px] font-mono text-slate-500">
                            Colored = mapped to a cluster · uncolored = left out · edit the text to clear the colors
                        </p>
                    )}
                </div>
                {/* Output Column */}
                <div className="p-4 bg-slate-950/30 flex flex-col h-full">
                    <div className="flex justify-between items-center mb-3">
                        <label className="font-semibold text-white flex items-center gap-2">
                          Intelligence Output
                          {selectedPersona === 'agent-activity' && resultText && <span className="max-w-64 truncate text-[10px] font-normal text-slate-500" title={`Source: ${activityScope}`}>Source: {activityScope}</span>}
                          {resultText && <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] rounded uppercase tracking-wide">Generated</span>}
                          {resultText && runInfo && <span data-testid="run-info" className="text-[10px] font-mono text-slate-500">{runInfo.model} · {runInfo.secs.toFixed(1)}s</span>}
                        </label>
                        <div className="flex gap-2">
                           {resultText && !isLoading && selectedPersona !== 'prompt-engineering' && selectedPersona !== 'knowledge-compressor' && selectedPersona !== 'agent-activity' && (
                              <button onClick={() => setShowDiff(!showDiff)} data-testid="diff-toggle" className={`px-2 py-1 rounded-md text-xs border ${showDiff ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'border-slate-700 text-slate-400 hover:text-white'}`}>
                                  Diff
                              </button>
                           )}
                           {resultText && !isLoading && (
                              <button onClick={handleCopy} className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition" title="Copy to Clipboard">
                                  {copyStatus ? <CheckIcon className="w-4 h-4 text-emerald-400"/> : <ClipboardIcon className="w-4 h-4"/>}
                              </button>
                          )}
                        </div>
                    </div>
                     <div className="relative w-full min-h-[300px] flex-grow bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-y-auto">
                        {isLoading ? (
                             <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
                                <div className="relative">
                                  <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse"></div>
                                  <svg className="animate-spin relative z-10 h-8 w-8 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                </div>
                                <span className="text-sm font-mono animate-pulse">
                                  {isThinkingAgent ? "Reasoning Matrix Active..." : "Processing..."}
                                </span>
                            </div>
                        ) : resultText ? (
                            <div className="prose prose-invert prose-sm max-w-none">
                                {selectedPersona === 'prompt-engineering' ? (
                                    <pre className="text-xs font-mono bg-black/30 p-4 rounded-lg border border-slate-800 overflow-x-auto">
                                        {(() => {
                                            try {
                                                const jsonObject = JSON.parse(resultText);
                                                return JSON.stringify(jsonObject, null, 2);
                                            } catch (e) {
                                                return resultText;
                                            }
                                        })()}
                                    </pre>
                                ) : selectedPersona === 'knowledge-compressor' ? (
                                    <ClusterView raw={resultText} source={resultSource} active={activeCluster} onActive={setActiveCluster} />
                                ) : showDiff && selectedPersona !== 'agent-activity' ? (
                                    <DiffView before={inputText} after={resultText} />
                                ) : (
                                    <div className="whitespace-pre-wrap font-mono text-sm text-slate-300 leading-relaxed">
                                      {resultText}
                                    </div>
                                )}
                            </div>
                        ) : (
                             <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
                                <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                                  <SparklesIcon className="w-5 h-5 opacity-50" />
                                </div>
                                <span className="text-sm">Select a protocol to execute</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
        <footer className="text-center mt-12">
            <p className="text-slate-600 text-xs font-mono uppercase tracking-widest">Nexus Prime // System Version 2.5.0</p>
        </footer>
      </main>
    </div>
  );
}
