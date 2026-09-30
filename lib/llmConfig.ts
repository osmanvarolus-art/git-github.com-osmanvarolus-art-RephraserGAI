export type Provider = 'local' | 'claude';

export interface LlmConfig {
  provider: Provider;
  // local: any OpenAI-compatible server (bonsai via /llm/v1, Ollama, ...)
  baseUrl: string;
  model: string;
  apiKey: string;
  // claude: Anthropic Messages API through the dev-server proxy /claude
  claudeModel: string;
  claudeKey: string;
}

export const DEFAULT_LLM: LlmConfig = {
  provider: 'local', baseUrl: '/llm/v1', model: 'bonsai-27b', apiKey: '', claudeModel: '', claudeKey: '',
};
const KEY = 'rephraser.llm';

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;
type Valid = { ok: true; value: LlmConfig } | { ok: false; error: string };

export function validateLlmConfig(c: Partial<LlmConfig>): Valid {
  const provider: Provider = c.provider === 'claude' ? 'claude' : 'local';
  const baseUrl = String(c.baseUrl ?? DEFAULT_LLM.baseUrl).trim();
  const model = String(c.model ?? DEFAULT_LLM.model).trim();
  const claudeModel = String(c.claudeModel ?? '').trim();
  const claudeKey = String(c.claudeKey ?? '').trim();
  if (!/^(\/|https?:\/\/)/.test(baseUrl)) return { ok: false, error: 'Base URL must start with / or http(s)://' };
  if (!model) return { ok: false, error: 'Model name is required' };
  if (provider === 'claude' && !claudeKey) return { ok: false, error: 'Enter your Claude API key' };
  if (provider === 'claude' && !claudeModel) return { ok: false, error: 'Pick a Claude model' };
  return {
    ok: true,
    value: { provider, baseUrl: baseUrl.replace(/\/+$/, ''), model, apiKey: String(c.apiKey ?? '').trim(), claudeModel, claudeKey },
  };
}

export function chatUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '') + '/chat/completions';
}

// llama.cpp/Ollama accept extra fields; the real OpenAI API rejects unknown ones.
export function isLocalEndpoint(baseUrl: string): boolean {
  return baseUrl.startsWith('/') || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(baseUrl);
}

export function modelLabel(c: LlmConfig): string {
  return c.provider === 'claude' ? `Claude · ${c.claudeModel}` : c.model;
}

export function loadLlmConfig(storage: Reader | undefined): LlmConfig {
  try {
    const raw = storage?.getItem(KEY);
    if (raw) {
      const v = validateLlmConfig(JSON.parse(raw));
      if (v.ok) return v.value;
    }
  } catch {
    /* fall through to default */
  }
  return { ...DEFAULT_LLM };
}

export function saveLlmConfig(storage: Writer, c: Partial<LlmConfig>): { ok: true } | { ok: false; error: string } {
  const v = validateLlmConfig(c);
  if (v.ok === false) return { ok: false, error: v.error };
  storage.setItem(KEY, JSON.stringify(v.value));
  return { ok: true };
}
