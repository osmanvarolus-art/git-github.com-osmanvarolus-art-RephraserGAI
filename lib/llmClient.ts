import { chatUrl, isLocalEndpoint, type LlmConfig } from './llmConfig.ts';

export interface LlmRequest {
  system?: string;
  prompt: string;
  temperature: number;
  json?: boolean; // ask for a JSON object (OpenAI-compatible servers only; Claude follows the prompt)
  schema?: { name: string; description?: string; schema: object }; // enforce this JSON Schema
}

type Fetch = typeof fetch;

const CLAUDE_MAX_TOKENS = 4096;
const LOCAL_MAX_TOKENS = 2500;
const ATTEMPTS = 3;

export function buildLocalRequest(cfg: LlmConfig, r: LlmRequest) {
  return {
    url: chatUrl(cfg.baseUrl),
    headers: { 'content-type': 'application/json', ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: {
      model: cfg.model,
      temperature: r.temperature,
      max_tokens: LOCAL_MAX_TOKENS,
      ...(isLocalEndpoint(cfg.baseUrl) ? { chat_template_kwargs: { enable_thinking: false } } : {}),
      messages: [...(r.system ? [{ role: 'system', content: r.system }] : []), { role: 'user', content: r.prompt }],
      ...(r.schema
        ? { response_format: { type: 'json_schema', json_schema: { name: r.schema.name, strict: true, schema: r.schema.schema } } }
        : r.json ? { response_format: { type: 'json_object' } } : {}),
    },
  };
}

export function buildClaudeRequest(cfg: LlmConfig, r: LlmRequest) {
  return {
    url: '/claude/v1/messages',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.claudeKey, 'anthropic-version': '2023-06-01' },
    body: {
      model: cfg.claudeModel,
      max_tokens: CLAUDE_MAX_TOKENS,
      temperature: Math.min(1, Math.max(0, r.temperature)),
      ...(r.system ? { system: r.system } : {}),
      messages: [{ role: 'user', content: r.prompt }],
      ...(r.schema
        ? {
            tools: [{ name: r.schema.name, description: r.schema.description ?? 'Return the result.', input_schema: r.schema.schema }],
            tool_choice: { type: 'tool', name: r.schema.name },
          }
        : {}),
    },
  };
}

export function parseReply(provider: LlmConfig['provider'], data: any): string {
  if (provider === 'claude') {
    const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
    const tool = blocks.find(b => b?.type === 'tool_use' && b.input);
    if (tool) return JSON.stringify(tool.input);
    return blocks
      .filter((b: any) => b?.type === 'text')
      .map((b: any) => b.text)
      .join('')
      .trim();
  }
  return String(data?.choices?.[0]?.message?.content ?? '').trim();
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return String(j?.error?.message ?? j?.message ?? '').slice(0, 200);
  } catch {
    return '';
  }
}

// One place for both providers: retries 5xx / network errors, never retries 4xx.
export async function callLlm(cfg: LlmConfig, r: LlmRequest, fetchFn: Fetch = fetch): Promise<string> {
  if (cfg.provider === 'claude' && !cfg.claudeKey) throw new Error('Claude API key missing. Open Model and enter it.');
  const req = cfg.provider === 'claude' ? buildClaudeRequest(cfg, r) : buildLocalRequest(cfg, r);
  const who = cfg.provider === 'claude' ? 'Claude' : 'Local model';
  let last = `${who} unreachable`;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetchFn(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
    } catch {
      res = null;
    }
    if (res?.ok) {
      const text = parseReply(cfg.provider, await res.json());
      if (!text) throw new Error(`${who} returned an empty reply`);
      return text;
    }
    if (res) {
      const d = await errorDetail(res);
      last = `${who} error ${res.status}${d ? ': ' + d : ''}`;
      if (res.status < 500 && res.status !== 429) break;
    }
  }
  throw new Error(last);
}

// ---- Claude model list (fetched live so new models appear without a code change) ----
export interface ClaudeModel { id: string; label: string }
export interface ModelGroup { family: string; models: ClaudeModel[] }

const FAMILIES = ['Opus', 'Sonnet', 'Haiku'];

export function groupClaudeModels(list: { id?: string; display_name?: string }[]): ModelGroup[] {
  const groups = new Map<string, ClaudeModel[]>();
  for (const m of list) {
    const id = String(m?.id ?? '');
    if (!id.startsWith('claude')) continue;
    const family = FAMILIES.find(f => id.toLowerCase().includes(f.toLowerCase())) ?? 'Other';
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family)!.push({ id, label: String(m.display_name || id) });
  }
  return [...FAMILIES, 'Other']
    .filter(f => groups.has(f))
    .map(f => ({ family: f, models: groups.get(f)!.sort((a, b) => b.id.localeCompare(a.id)) }));
}

export async function fetchClaudeModels(key: string, fetchFn: Fetch = fetch): Promise<ModelGroup[]> {
  if (!key.trim()) throw new Error('Enter your Claude API key first');
  let res: Response;
  try {
    res = await fetchFn('/claude/v1/models?limit=100', {
      headers: { 'x-api-key': key.trim(), 'anthropic-version': '2023-06-01' },
    });
  } catch {
    throw new Error('Claude unreachable');
  }
  if (!res.ok) {
    const d = await errorDetail(res);
    throw new Error(`Claude error ${res.status}${d ? ': ' + d : ''}`);
  }
  const groups = groupClaudeModels((await res.json())?.data ?? []);
  if (!groups.length) throw new Error('No Claude models returned for this key');
  return groups;
}
