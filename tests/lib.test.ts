import test from 'node:test';
import assert from 'node:assert/strict';
import { wordDiff } from '../lib/diff.ts';
import {
  applyPrompt, makeCustomMode, parseCustomModes, serializeCustomModes,
  loadCustomModes, saveCustomModes, MAX_MODES,
} from '../lib/customModes.ts';
import {
  validateLlmConfig, chatUrl, isLocalEndpoint, loadLlmConfig, saveLlmConfig, DEFAULT_LLM,
} from '../lib/llmConfig.ts';

const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

// ---- diff ----
test('diff: identical text is one same segment', () => {
  assert.deepEqual(wordDiff('a b c', 'a b c'), [{ t: 'same', text: 'a b c' }]);
});
test('diff: reconstructs both sides exactly', () => {
  const a = 'hey, send me the report asap';
  const b = 'Please send me the report at your earliest convenience.';
  const segs = wordDiff(a, b);
  assert.equal(segs.filter(s => s.t !== 'add').map(s => s.text).join(''), a);
  assert.equal(segs.filter(s => s.t !== 'del').map(s => s.text).join(''), b);
});
test('diff: pure insertion and pure deletion', () => {
  assert.deepEqual(wordDiff('', 'x y'), [{ t: 'add', text: 'x y' }]);
  assert.deepEqual(wordDiff('x y', ''), [{ t: 'del', text: 'x y' }]);
  assert.deepEqual(wordDiff('', ''), []);
});
test('diff: huge inputs fall back instead of hanging', () => {
  const big = Array.from({ length: 3000 }, (_, i) => 'w' + i).join(' ');
  const t0 = Date.now();
  const segs = wordDiff(big, big + ' extra');
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(segs.filter(s => s.t !== 'del').map(s => s.text).join(''), big + ' extra');
});

// ---- custom modes ----
test('custom mode: builds id from name and dedupes', () => {
  const a = makeCustomMode('Pirate Talk!', '🏴‍☠️', 'Speak like a pirate: {{text}}');
  assert.ok(a.ok && a.mode.id === 'custom:pirate-talk');
  const b = makeCustomMode('Pirate Talk', '', 'again', a.ok ? [a.mode] : []);
  assert.ok(b.ok && b.mode.id === 'custom:pirate-talk-2' && b.mode.emoji === '✨');
});
test('custom mode: rejects empty, oversized and over-limit', () => {
  assert.equal(makeCustomMode('', '', 'p').ok, false);
  assert.equal(makeCustomMode('n', '', '').ok, false);
  assert.equal(makeCustomMode('n', '', 'x'.repeat(4001)).ok, false);
  assert.equal(makeCustomMode('x'.repeat(41), '', 'p').ok, false);
  const full = Array.from({ length: MAX_MODES }, (_, i) => ({ id: 'custom:m' + i, name: 'm' + i, emoji: '✨', prompt: 'p' }));
  assert.equal(makeCustomMode('one more', '', 'p', full).ok, false);
});
test('custom mode: export then import round-trips', () => {
  const a = makeCustomMode('One', '1', 'p1 {{text}}');
  const b = makeCustomMode('Two', '2', 'p2', a.ok ? [a.mode] : []);
  const modes = [a, b].map(r => (r.ok ? r.mode : null)!);
  const back = parseCustomModes(serializeCustomModes(modes));
  assert.ok(back.ok);
  assert.deepEqual(back.ok && back.modes, modes);
});
test('custom mode: import rejects garbage', () => {
  assert.equal(parseCustomModes('not json').ok, false);
  assert.equal(parseCustomModes('{"a":1}').ok, false);
  assert.equal(parseCustomModes('[{"name":"","prompt":"x"}]').ok, false);
});
test('custom mode: applyPrompt uses placeholder or appends', () => {
  assert.equal(applyPrompt('Shout: {{text}}!', 'hi'), 'Shout: hi!');
  assert.equal(applyPrompt('{{text}} and {{text}}', 'x'), 'x and x');
  assert.equal(applyPrompt('Rewrite', 'hi'), 'Rewrite\n\nhi');
});
test('custom mode: storage round trip and corrupt storage', () => {
  const s = memStore();
  const m = makeCustomMode('A', '', 'p');
  saveCustomModes(s, m.ok ? [m.mode] : []);
  assert.equal(loadCustomModes(s).length, 1);
  s.setItem('rephraser.customModes', '{{{');
  assert.deepEqual(loadCustomModes(s), []);
  assert.deepEqual(loadCustomModes(undefined), []);
});

// ---- llm config ----
test('llm config: validation', () => {
  assert.equal(validateLlmConfig({ baseUrl: 'ftp://x', model: 'm' }).ok, false);
  assert.equal(validateLlmConfig({ baseUrl: '/llm/v1', model: '  ' }).ok, false);
  const ok = validateLlmConfig({ baseUrl: 'http://localhost:11434/v1///', model: ' qwen ', apiKey: ' k ' });
  assert.ok(ok.ok);
  assert.ok(ok.ok);
  assert.deepEqual(ok.ok && { baseUrl: ok.value.baseUrl, model: ok.value.model, apiKey: ok.value.apiKey, provider: ok.value.provider },
    { baseUrl: 'http://localhost:11434/v1', model: 'qwen', apiKey: 'k', provider: 'local' });
});
test('llm config: chatUrl joins without double slash', () => {
  assert.equal(chatUrl('/llm/v1/'), '/llm/v1/chat/completions');
  assert.equal(chatUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1/chat/completions');
});
test('llm config: only local endpoints get extra llama.cpp fields', () => {
  assert.equal(isLocalEndpoint('/llm/v1'), true);
  assert.equal(isLocalEndpoint('http://localhost:11434/v1'), true);
  assert.equal(isLocalEndpoint('http://127.0.0.1:8081/v1'), true);
  assert.equal(isLocalEndpoint('https://api.openai.com/v1'), false);
  assert.equal(isLocalEndpoint('https://localhost.evil.com/v1'), false);
});
test('llm config: default, save/load, invalid saved value falls back', () => {
  const s = memStore();
  assert.deepEqual(loadLlmConfig(s), DEFAULT_LLM);
  assert.equal(saveLlmConfig(s, { baseUrl: 'bad', model: 'm' }).ok, false);
  assert.deepEqual(loadLlmConfig(s), DEFAULT_LLM);
  assert.ok(saveLlmConfig(s, { baseUrl: 'http://localhost:11434/v1', model: 'q' }).ok);
  assert.equal(loadLlmConfig(s).model, 'q');
  s.setItem('rephraser.llm', '{"baseUrl":"nope","model":"x"}');
  assert.deepEqual(loadLlmConfig(s), DEFAULT_LLM);
});
