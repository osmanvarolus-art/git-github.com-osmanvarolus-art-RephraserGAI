import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClaudeRequest, buildLocalRequest, callLlm, fetchClaudeModels, groupClaudeModels, parseReply,
} from '../lib/llmClient.ts';
import { DEFAULT_LLM, validateLlmConfig, modelLabel, type LlmConfig } from '../lib/llmConfig.ts';

const claudeCfg: LlmConfig = { ...DEFAULT_LLM, provider: 'claude', claudeKey: 'sk-test', claudeModel: 'claude-sonnet-x' };
const R = { system: 'be brief', prompt: 'hi', temperature: 0.7 };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

test('claude request: Messages API shape, key header, system separate', () => {
  const q = buildClaudeRequest(claudeCfg, R);
  assert.equal(q.url, '/claude/v1/messages');
  assert.equal(q.headers['x-api-key'], 'sk-test');
  assert.equal(q.headers['anthropic-version'], '2023-06-01');
  assert.equal(q.body.model, 'claude-sonnet-x');
  assert.equal(q.body.system, 'be brief');
  assert.deepEqual(q.body.messages, [{ role: 'user', content: 'hi' }]);
  assert.ok(q.body.max_tokens > 0);
});
test('claude request: no system field when absent, temperature clamped to 0..1', () => {
  const q = buildClaudeRequest(claudeCfg, { prompt: 'x', temperature: 1.7 });
  assert.ok(!('system' in q.body));
  assert.equal(q.body.temperature, 1);
});
test('local request: thinking off only for local endpoints, no key header by default', () => {
  const local = buildLocalRequest(DEFAULT_LLM, R);
  assert.equal(local.url, '/llm/v1/chat/completions');
  assert.deepEqual((local.body as any).chat_template_kwargs, { enable_thinking: false });
  assert.ok(!('authorization' in local.headers));
  const hosted = buildLocalRequest({ ...DEFAULT_LLM, baseUrl: 'https://api.openai.com/v1', apiKey: 'k' }, R);
  assert.ok(!('chat_template_kwargs' in hosted.body));
  assert.equal((hosted.headers as any).authorization, 'Bearer k');
});
test('parseReply: joins claude text blocks, ignores non-text; openai shape', () => {
  assert.equal(parseReply('claude', { content: [{ type: 'text', text: 'a' }, { type: 'tool_use' }, { type: 'text', text: 'b' }] }), 'ab');
  assert.equal(parseReply('claude', {}), '');
  assert.equal(parseReply('local', { choices: [{ message: { content: ' hi ' } }] }), 'hi');
  assert.equal(parseReply('local', null), '');
});
test('callLlm claude: returns text', async () => {
  const f = (async () => json(200, { content: [{ type: 'text', text: 'Merhaba' }] })) as typeof fetch;
  assert.equal(await callLlm(claudeCfg, R, f), 'Merhaba');
});
test('callLlm: missing claude key fails before any request', async () => {
  let called = 0;
  const f = (async () => { called++; return json(200, {}); }) as typeof fetch;
  await assert.rejects(callLlm({ ...claudeCfg, claudeKey: '' }, R, f), /key missing/);
  assert.equal(called, 0);
});
test('callLlm: 4xx is not retried and shows the API message', async () => {
  let called = 0;
  const f = (async () => { called++; return json(401, { error: { message: 'invalid x-api-key' } }); }) as typeof fetch;
  await assert.rejects(callLlm(claudeCfg, R, f), /Claude error 401: invalid x-api-key/);
  assert.equal(called, 1);
});
test('callLlm: 5xx and 429 are retried, then succeed', async () => {
  const codes = [529, 429, 200];
  let i = 0;
  const f = (async () => {
    const c = codes[i++];
    return c === 200 ? json(200, { content: [{ type: 'text', text: 'ok' }] }) : json(c, { error: { message: 'busy' } });
  }) as typeof fetch;
  assert.equal(await callLlm(claudeCfg, R, f), 'ok');
  assert.equal(i, 3);
});
test('callLlm: gives up after 3 attempts; network error is reported', async () => {
  let i = 0;
  const f = (async () => { i++; throw new Error('net'); }) as typeof fetch;
  await assert.rejects(callLlm(claudeCfg, R, f), /Claude unreachable/);
  assert.equal(i, 3);
});
test('callLlm: empty reply is an error, not a blank success', async () => {
  const f = (async () => json(200, { content: [] })) as typeof fetch;
  await assert.rejects(callLlm(claudeCfg, R, f), /empty reply/);
});
test('groupClaudeModels: Opus/Sonnet/Haiku groups, newest id first, non-claude dropped', () => {
  const g = groupClaudeModels([
    { id: 'claude-haiku-1', display_name: 'Haiku 1' },
    { id: 'claude-sonnet-2', display_name: 'Sonnet 2' },
    { id: 'claude-sonnet-9', display_name: 'Sonnet 9' },
    { id: 'claude-opus-3', display_name: 'Opus 3' },
    { id: 'gpt-4' },
    { id: 'claude-mystery-1' },
  ]);
  assert.deepEqual(g.map(x => x.family), ['Opus', 'Sonnet', 'Haiku', 'Other']);
  assert.deepEqual(g[1].models.map(m => m.id), ['claude-sonnet-9', 'claude-sonnet-2']);
  assert.equal(g[1].models[0].label, 'Sonnet 9');
});
test('fetchClaudeModels: needs key, surfaces errors, returns groups', async () => {
  await assert.rejects(fetchClaudeModels('  '), /API key/);
  const bad = (async () => json(401, { error: { message: 'nope' } })) as typeof fetch;
  await assert.rejects(fetchClaudeModels('k', bad), /Claude error 401: nope/);
  const empty = (async () => json(200, { data: [] })) as typeof fetch;
  await assert.rejects(fetchClaudeModels('k', empty), /No Claude models/);
  let seen: any;
  const ok = (async (u: any, init: any) => { seen = { u, init }; return json(200, { data: [{ id: 'claude-opus-4', display_name: 'Opus 4' }] }); }) as typeof fetch;
  const g = await fetchClaudeModels(' k ', ok);
  assert.equal(g[0].models[0].id, 'claude-opus-4');
  assert.equal(seen.init.headers['x-api-key'], 'k');
  assert.match(seen.u, /^\/claude\/v1\/models/);
});
test('config: claude needs key and model; label shows provider', () => {
  assert.equal(validateLlmConfig({ provider: 'claude', claudeModel: 'm' }).ok, false);
  assert.equal(validateLlmConfig({ provider: 'claude', claudeKey: 'k' }).ok, false);
  const v = validateLlmConfig({ provider: 'claude', claudeKey: 'k', claudeModel: 'claude-x' });
  assert.ok(v.ok);
  assert.equal(modelLabel(v.ok ? v.value : DEFAULT_LLM), 'Claude · claude-x');
  assert.equal(modelLabel(DEFAULT_LLM), 'bonsai-27b');
});
test('config: old saved format (no provider) still loads as local bonsai', () => {
  const v = validateLlmConfig({ baseUrl: '/llm/v1', model: 'bonsai-27b' });
  assert.ok(v.ok && v.value.provider === 'local');
});

// ---- structured output (knowledge compressor schema) ----
const SCHEMA = { name: 'knowledge_compressor', description: 'd', schema: { type: 'object', properties: { clusters: { type: 'array' } }, required: ['clusters'] } };

test('claude request with schema: forces one tool, input_schema is the schema', () => {
  const q: any = buildClaudeRequest(claudeCfg, { ...R, schema: SCHEMA });
  assert.equal(q.body.tools.length, 1);
  assert.equal(q.body.tools[0].name, 'knowledge_compressor');
  assert.deepEqual(q.body.tools[0].input_schema, SCHEMA.schema);
  assert.deepEqual(q.body.tool_choice, { type: 'tool', name: 'knowledge_compressor' });
});
test('claude request without schema has no tools', () => {
  const q: any = buildClaudeRequest(claudeCfg, R);
  assert.ok(!('tools' in q.body) && !('tool_choice' in q.body));
});
test('local request with schema: json_schema strict response_format wins over json_object', () => {
  const q: any = buildLocalRequest(DEFAULT_LLM, { ...R, json: true, schema: SCHEMA });
  assert.equal(q.body.response_format.type, 'json_schema');
  assert.equal(q.body.response_format.json_schema.strict, true);
  assert.deepEqual(q.body.response_format.json_schema.schema, SCHEMA.schema);
});
test('parseReply claude: tool_use input comes back as JSON text', () => {
  const out = parseReply('claude', { content: [{ type: 'text', text: 'thinking' }, { type: 'tool_use', name: 'x', input: { clusters: [1] } }] });
  assert.deepEqual(JSON.parse(out), { clusters: [1] });
});
test('callLlm claude with schema end to end: tool input reaches the caller', async () => {
  const f = (async (_u: any, init: any) => {
    assert.ok(JSON.parse(init.body).tools);
    return json(200, { content: [{ type: 'tool_use', name: 'knowledge_compressor', input: { clusters: [] } }] });
  }) as typeof fetch;
  assert.equal(await callLlm(claudeCfg, { ...R, schema: SCHEMA }, f), '{"clusters":[]}');
});
