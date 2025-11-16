
import React, { useState, useEffect, useCallback, FC, useRef, useLayoutEffect } from 'react';
import { Persona } from './types';
import { PERSONAS } from './constants';
import { rephraseText } from './services/geminiService';

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

// --- UI Components ---
interface PersonaSelectorProps {
  selectedPersona: string;
  onSelect: (personaId: string) => void;
}
const PersonaSelector: FC<PersonaSelectorProps> = ({ selectedPersona, onSelect }) => (
  <div className="flex flex-wrap gap-2">
    {PERSONAS.map((persona) => (
      <button
        key={persona.id}
        onClick={() => onSelect(persona.id)}
        className={`px-3 py-1.5 text-sm font-medium rounded-full flex items-center transition-all duration-200 ${
          selectedPersona === persona.id
            ? 'bg-indigo-600 text-white'
            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
        }`}
      >
        <span className="mr-1.5">{persona.emoji}</span>
        {persona.name}
      </button>
    ))}
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      // Reset height to allow shrinking
      textarea.style.height = 'auto';
      // Set height to scrollHeight to fit content
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [inputText]);
  
  const handleRephrase = useCallback(async () => {
    if (!inputText.trim()) {
      setError('Please enter some text to rephrase.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setResultText('');

    try {
      const rephrased = await rephraseText(inputText, selectedPersona);
      setResultText(rephrased);
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [inputText, selectedPersona]);

  const handleCopy = () => {
    if (!resultText) return;
    navigator.clipboard.writeText(resultText);
    setCopyStatus(true);
    setTimeout(() => setCopyStatus(false), 2000);
  };

  const selectedPersonaDetails = PERSONAS.find(p => p.id === selectedPersona);

  return (
    <div className="min-h-screen text-slate-200 antialiased relative">
      <main className="container mx-auto px-4 py-8 sm:py-16">
        <header className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white">EchoWrite <span className="text-indigo-400">AI</span></h1>
            <p className="mt-3 text-lg text-slate-400 max-w-2xl mx-auto">Transform your text with the perfect tone, powered by Gemini.</p>
        </header>
        
        <div className="max-w-5xl mx-auto bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl shadow-black/20 overflow-hidden">
            <div className="p-6 border-b border-slate-700">
                <h3 className="text-lg font-semibold text-white mb-4">Select a Persona</h3>
                <PersonaSelector selectedPersona={selectedPersona} onSelect={setSelectedPersona} />
                {selectedPersona === 'notebooklm' && (
                  <div className="mt-4 p-3 bg-slate-700/50 border border-slate-600 rounded-lg text-center">
                    <p className="text-sm text-slate-300">
                        Perfect for your notes! Take this Markdown to{' '}
                        <a 
                            href="https://notebooklm.google.com" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="font-semibold text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition"
                        >
                            Google NotebookLM &rarr;
                        </a>
                    </p>
                  </div>
                )}
            </div>

            <div className="grid md:grid-cols-2">
                {/* Input Column */}
                <div className="p-6">
                    <div className="flex justify-between items-center mb-2">
                        <label htmlFor="inputText" className="font-semibold text-white">Your Text</label>
                        <span className="text-xs text-slate-400">{inputText.length} / 5000</span>
                    </div>
                    <textarea
                        id="inputText"
                        ref={inputRef}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Start typing or paste your text here..."
                        maxLength={5000}
                        className="w-full min-h-[192px] sm:min-h-[256px] bg-slate-900 border border-slate-700 rounded-lg p-4 resize-none focus:ring-2 focus:ring-indigo-500 focus:outline-none transition text-slate-300 overscroll-y-contain overflow-y-auto"
                        style={{ maxHeight: '70vh' }}
                    />
                </div>
                {/* Output Column */}
                <div className="p-6 bg-slate-900/50 flex flex-col">
                    <div className="flex justify-between items-center mb-2">
                        <label className="font-semibold text-white">Rephrased Text</label>
                        <span className="text-xs text-slate-400">{resultText.length}</span>
                    </div>
                     <div className="relative w-full min-h-[192px] sm:min-h-[256px] flex-grow bg-slate-800 border border-slate-700 rounded-lg p-4 overflow-y-auto">
                        {isLoading ? (
                             <div className="flex items-center justify-center h-full text-slate-400">
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Rephrasing...
                            </div>
                        ) : resultText ? (
                            selectedPersona === 'prompt-engineering' ? (
                                <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono bg-slate-900/50 p-3 rounded-md">
                                    {(() => {
                                        try {
                                            const jsonObject = JSON.parse(resultText);
                                            return JSON.stringify(jsonObject, null, 2);
                                        } catch (e) {
                                            return resultText; // Fallback if not valid JSON
                                        }
                                    })()}
                                </pre>
                            ) : (
                                <p className="text-slate-300 whitespace-pre-wrap">{resultText}</p>
                            )
                        ) : (
                             <div className="flex items-center justify-center h-full text-slate-500">
                                Your rephrased text will appear here.
                            </div>
                        )}
                        {resultText && !isLoading && (
                            <button onClick={handleCopy} className="absolute top-2 right-2 p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition">
                                {copyStatus ? <CheckIcon className="w-5 h-5 text-green-400"/> : <ClipboardIcon className="w-5 h-5"/>}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-6 bg-slate-800 border-t border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="w-full sm:w-auto">
                    {error && <p className="text-red-400 text-sm text-center sm:text-left">{error}</p>}
                </div>
                <button 
                    onClick={handleRephrase} 
                    disabled={isLoading || !inputText}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold px-6 py-3 rounded-lg hover:bg-indigo-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
                >
                    <SparklesIcon className="w-5 h-5" />
                    <span>{isLoading ? 'Rephrasing...' : `Rephrase as ${selectedPersonaDetails?.name}`}</span>
                </button>
            </div>
        </div>
        <footer className="text-center mt-12">
            <p className="text-slate-500 text-sm">Powered by Google Gemini. Made with ❤️.</p>
        </footer>
      </main>
    </div>
  );
}
