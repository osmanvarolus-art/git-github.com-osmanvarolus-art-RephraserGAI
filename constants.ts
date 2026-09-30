
import { Persona } from './types';

export const PERSONAS: Persona[] = [
  // --- The Game Changers (Blue Ocean) ---
  { id: 'executive-brief', name: 'C-Suite Brief (Strategy)', emoji: '📊' },
  // Disabled for now (local bonsai errors on these); re-enable by uncommenting.
  // { id: 'legal-shield', name: 'Legal Shield (Risk Audit)', emoji: '🛡️' },
  { id: 'legacy-refactor', name: 'Legacy Alchemist (Code)', emoji: '🏗️' },
  // { id: 'medical-claim', name: 'Medical Claim (Insurance)', emoji: '⚕️' },
  { id: 'semantic-dna', name: 'Semantic DNA (Keywords)', emoji: '🧬' },
  { id: 'brainstorming', name: 'Brainstorming (Workflow)', emoji: '⚡' },
  { id: 'knowledge-compressor', name: 'Knowledge Compressor (Clusters)', emoji: '🧩' },
  { id: 'agent-activity', name: 'Agent Activity', emoji: '🧭' },
  
  // --- Standard Tier ---
  { id: 'viral-creator', name: 'Viral Creator', emoji: '🚀' },
  { id: 'analogy-master', name: 'Analogy Master', emoji: '💡' },
  { id: 'professional', name: 'Professional', emoji: '💼' },
  { id: 'confident', name: 'Confident', emoji: '💪' },
  { id: 'friendly', name: 'Friendly', emoji: '😊' },
  { id: 'casual', name: 'Casual', emoji: '😎' },
  { id: 'concise', name: 'Concise', emoji: '✂️' },
  { id: 'notebooklm', name: 'NotebookLM (MD)', emoji: '📝' },
  { id: 'objective-critic', name: 'Objective Critic', emoji: '🧐' },
];
