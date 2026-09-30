export interface CustomMode {
  id: string; // always "custom:<slug>"
  name: string;
  emoji: string;
  prompt: string; // may contain {{text}}; otherwise the input is appended
}

export const MAX_MODES = 20;
const KEY = 'rephraser.customModes';

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;
type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
type Fail = { ok: false; error: string };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mode';

export function makeCustomMode(name: string, emoji: string, prompt: string, existing: CustomMode[] = []): Result<{ mode: CustomMode }> {
  name = name.trim();
  prompt = prompt.trim();
  if (!name || name.length > 40) return { ok: false, error: 'Name must be 1-40 characters' };
  if (!prompt || prompt.length > 4000) return { ok: false, error: 'Prompt must be 1-4000 characters' };
  if (existing.length >= MAX_MODES) return { ok: false, error: `At most ${MAX_MODES} custom modes` };
  let id = 'custom:' + slug(name);
  for (let i = 2; existing.some(m => m.id === id); i++) id = `custom:${slug(name)}-${i}`;
  return { ok: true, mode: { id, name, emoji: (emoji || '✨').trim().slice(0, 4), prompt } };
}

export function serializeCustomModes(modes: CustomMode[]): string {
  return JSON.stringify(modes, null, 2);
}

export function parseCustomModes(json: string): Result<{ modes: CustomMode[] }> {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Not valid JSON' };
  }
  if (!Array.isArray(data)) return { ok: false, error: 'Expected a JSON array' };
  const modes: CustomMode[] = [];
  for (const item of data) {
    const r = makeCustomMode(String(item?.name ?? ''), String(item?.emoji ?? ''), String(item?.prompt ?? ''), modes);
    if (r.ok === false) return r as Fail;
    modes.push(r.mode);
  }
  return { ok: true, modes };
}

export function applyPrompt(prompt: string, text: string): string {
  return prompt.includes('{{text}}') ? prompt.split('{{text}}').join(text) : `${prompt}\n\n${text}`;
}

export function loadCustomModes(storage: Reader | undefined): CustomMode[] {
  try {
    const raw = storage?.getItem(KEY);
    if (raw) {
      const r = parseCustomModes(raw);
      if (r.ok) return r.modes;
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function saveCustomModes(storage: Writer, modes: CustomMode[]): void {
  storage.setItem(KEY, serializeCustomModes(modes));
}
