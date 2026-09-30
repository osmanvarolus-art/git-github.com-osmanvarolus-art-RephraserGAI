
import React, { useState, useEffect, useCallback, useMemo, FC, useRef, useLayoutEffect } from 'react';
import { PERSONAS } from './constants';
import { rephraseText, TuningParams } from './services/geminiService';
import { ModelSettings, ModesManager, DiffView, ClusterView } from './components/Panels';
import { InputHighlight } from './components/InputHighlight';
import { parseCompressed } from './lib/compressor';
import { CustomMode, loadCustomModes, saveCustomModes } from './lib/customModes';
import { loadLlmConfig, modelLabel } from './lib/llmConfig';

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
    <div className="flex flex-wrap gap-2">
      {[...PERSONAS, ...extra].map((persona) => {
        const isHighValue = highValueIds.includes(persona.id);
        const isSelected = selectedPersona === persona.id;
        
        return (
          <button
            key={persona.id}
            onClick={() => onExecute(persona.id)}
            disabled={isLoading}
            className={`px-3 py-1.5 text-sm font-medium rounded-full flex items-center transition-all duration-200 border disabled:opacity-50 disabled:cursor-not-allowed ${
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
            {persona.name}
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
  const [selectedPersona, setSelectedPersona] = useState<string>(PERSONAS[0].id);
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

  const updateModes = (m: CustomMode[]) => { setCustomModes(m); saveCustomModes(localStorage, m); };

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [inputText]);
  
  const handleRephrase = useCallback(async (personaId: string) => {
    setSelectedPersona(personaId);

    if (!inputText.trim()) {
      setError('Input payload empty. Initiate data stream.');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setResultText('');
    setResultSource(inputText);
    setActiveCluster(null);

    try {
      const label = modelLabel(loadLlmConfig(localStorage));
      const t0 = Date.now();
      const rephrased = await rephraseText(inputText, personaId, tuning);
      setResultText(rephrased);
      setRunInfo({ model: label, secs: (Date.now() - t0) / 1000 });
    } catch (err: any) {
      setError(err.message || 'Neural link interrupted.');
    } finally {
      setIsLoading(false);
    }
  }, [inputText, tuning]);

  const handleCopy = () => {
    if (!resultText) return;
    navigator.clipboard.writeText(resultText);
    setCopyStatus(true);
    setTimeout(() => setCopyStatus(false), 2000);
  };

  const selectedPersonaDetails = PERSONAS.find(p => p.id === selectedPersona);

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

      <main className="w-full px-4 py-4">
        <header className="text-center mb-4">
            <div className="inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 mb-4">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-medium text-slate-400 tracking-wide uppercase">System Operational</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-1">
              NEXUS <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 font-light">PRIME</span>
            </h1>
            <p className="hidden">
              Cognitive Transmutation Engine. Transform raw data into <span className="text-indigo-300">strategic intelligence</span> using Reasoning Agents.
            </p>
        </header>
        
        <div className="w-full bg-slate-900/80 backdrop-blur-2xl border border-slate-800 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden ring-1 ring-white/5">
            <div className="p-6 border-b border-slate-800 bg-slate-900/50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    Select Protocol & Execute
                  </h3>
                  <div className="flex gap-2 items-center">
                    {isThinkingAgent && (
                      <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs text-amber-300">
                        <BrainIcon className="w-3 h-3" />
                        <span>Deep Reasoning</span>
                      </div>
                    )}
                    <button 
                      onClick={() => setPanel(panel === 'modes' ? '' : 'modes')}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${panel === 'modes' ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                    >
                      My Modes
                    </button>
                    <button 
                      onClick={() => setPanel(panel === 'model' ? '' : 'model')}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${panel === 'model' ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                    >
                      Model
                    </button>
                    <button 
                      onClick={() => setShowTuner(!showTuner)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all ${showTuner ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                    >
                      <AdjustmentsIcon className="w-3 h-3" />
                      Tune Reality
                    </button>
                  </div>
                </div>
                
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-grow">
                     <PersonaSelector selectedPersona={selectedPersona} onExecute={handleRephrase} isLoading={isLoading} extra={customModes} />
                     {panel === 'model' && <ModelSettings onSaved={() => setError(null)} />}
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
                </div>

                {error && <p className="mt-4 text-red-400 text-xs font-mono bg-red-950/30 px-3 py-1 rounded border border-red-900/50 text-center sm:text-left">{error}</p>}
            </div>

            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
                {/* Input Column */}
                <div className="p-6 flex flex-col h-full">
                    <div className="flex justify-between items-center mb-3">
                        <label htmlFor="inputText" className="font-semibold text-white flex items-center gap-2">
                          Input Data
                        </label>
                        <span className="text-xs font-mono text-slate-500">{inputText.length} chars</span>
                    </div>
                    <div className="relative rounded-lg bg-slate-950">
                        {showInputHighlight && compressed && (
                            <InputHighlight text={resultSource} clusters={compressed.clusters} active={activeCluster} />
                        )}
                        <textarea
                            id="inputText"
                            ref={inputRef}
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder={isThinkingAgent ? "Paste complex documentation, legal contracts, or legacy code here..." : "Enter text to process..."}
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
                <div className="p-6 bg-slate-950/30 flex flex-col h-full">
                    <div className="flex justify-between items-center mb-3">
                        <label className="font-semibold text-white flex items-center gap-2">
                          Intelligence Output
                          {resultText && <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] rounded uppercase tracking-wide">Generated</span>}
                          {resultText && runInfo && <span data-testid="run-info" className="text-[10px] font-mono text-slate-500">{runInfo.model} · {runInfo.secs.toFixed(1)}s</span>}
                        </label>
                        <div className="flex gap-2">
                           {resultText && !isLoading && selectedPersona !== 'prompt-engineering' && selectedPersona !== 'knowledge-compressor' && (
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
                                ) : showDiff ? (
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