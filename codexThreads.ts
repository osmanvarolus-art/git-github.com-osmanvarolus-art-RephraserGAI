import { createReadStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Plugin } from 'vite';

export const localLlmProxyTarget = 'http://127.0.0.1:8081';

const codexDir = path.join(homedir(), '.codex');
const sessionsDir = path.join(codexDir, 'sessions');
const herdrBin = path.join(homedir(), '.local', 'bin', 'herdr');
const idPattern = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const maxSourceChars = 24000;
const maxRecentThreads = 20;
const maxHerdrAgents = 12;
const maxOwnerGoals = 24;
const goalIntentPattern = /\b(?:i want|i need|i asked|i forget|i forgot|remember|recall|summari[sz]e|my goal|please keep|help me remember)\b|(?:istiyorum|istediğim|istediğimi|istiyordum|isteklerim|unut(?:uyorum|tum)?|hatırla|özetle|bana anlat|bana söyle|olsun|olmalı)/i;
const goalTopicPattern = /\b(?:agent|codex|herdr|conversation|thread|stream|activity|prompt|task|history|grok|north.?star|goal|context)\b|ajan|konuşma|yazışma|akış|istek|bağlam|hedef|özet|hatırla|unut/i;
const correctionPattern = /\b(?:correction|instead|i meant|not that|no[, ]|actually,? i|rather)\b|(?:düzeltme|yanlış|bunun yerine|hayır[, ]|öyle değil)/i;
const boilerplatePattern = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:AGENTS\.md instructions|environment context|skills instructions|available skills)\b|<\/?(?:INSTRUCTIONS|environment_context|skills_instructions)>|\bsandbox_mode\s*:|\b(?:agent|codex) sandbox\b|\bMUST USE when user\b|\bYou are Codex, an agent\b/i;

function isLoopback(req: import('node:http').IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? '';
  return address === '::1' || address === '127.0.0.1' || address === '::ffff:127.0.0.1';
}

function isLocalOrigin(req: import('node:http').IncomingMessage): boolean {
  const host = req.headers.host;
  let origin = req.headers.origin;
  if (!origin) {
    const referer = req.headers.referer;
    if (req.headers['sec-fetch-site'] !== 'same-origin' || !referer) return false;
    try { origin = new URL(referer).origin; } catch { return false; }
  }
  if (!host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:' && parsed.host === host && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function respond(res: import('node:http').ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(body));
}

async function sessionFiles(dir = sessionsDir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sessionFiles(full);
    return entry.isFile() && entry.name.endsWith('.jsonl') ? [full] : [];
  }));
  return nested.flat();
}

async function indexThreads() {
  const contents = await readFile(path.join(codexDir, 'session_index.jsonl'), 'utf8');
  const byId = new Map<string, { id: string; title: string; updatedAt: string }>();
  for (const line of contents.split('\n')) {
    try {
      const item = JSON.parse(line);
      if (typeof item.id === 'string' && typeof item.thread_name === 'string' && typeof item.updated_at === 'string') {
        byId.set(item.id, { id: item.id, title: item.thread_name, updatedAt: item.updated_at });
      }
    } catch { /* Ignore an incomplete last index line. */ }
  }
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 40);
}

function itemText(item: any): string {
  return Array.isArray(item?.content)
    ? redactSensitive(item.content.filter((part: any) => typeof part?.text === 'string').map((part: any) => part.text).join('\n').trim())
    : '';
}

export function redactSensitive(text: string): string {
  return text
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[private key redacted]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]{12,}=*/gi, '$1 [credential redacted]')
    .replace(/(?<![A-Za-z0-9])((?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|token|secret|password|passwd|authorization)["']?\s*:\s*)["'][^"']*["']/gi, '$1"[credential redacted]"')
    .replace(/(?<![A-Za-z0-9])((?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|token|secret|password|passwd|authorization)\s*[:=]\s*)["']?[^\s,'";}]+["']?/gi, '$1[credential redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/g, '[credential redacted]');
}

function runHerdr(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => execFile(herdrBin, args, { encoding: 'utf8', timeout: 4000, maxBuffer: 512 * 1024 }, (error, stdout) => {
    if (error) reject(error);
    else resolve(stdout);
  }));
}

// North Star's own truth: the factory log lines (goal opened, evaluated, merged, reverted), from the existing ns_feed.py.
function readNorthStarLog(): Promise<{ time: string; source: string; threadTitle: string; status: string; text: string }[]> {
  return new Promise(resolve => {
    const tools = path.join(homedir(), 'Projects', 'ns-ratchet', 'tools');
    // ns_feed.py's command line ignores arguments and always uses 30 minutes; ask for 6 hours through its collect().
    execFile('python3', ['-B', '-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(tools)}); import ns_feed; print(json.dumps(ns_feed.collect(360), ensure_ascii=False))`], { timeout: 20000, maxBuffer: 8_000_000 }, (err, out) => {
      if (err) return resolve([]);
      try {
        const rows = (JSON.parse(out).sentences as { text: string; source: string }[]).filter(row => row.source === 'tick.log');
        resolve(rows.slice(-60).map(row => {
          const m = /^(\d{4}-\d\d-\d\dT[\d:+.-]+)\s+(.*)$/s.exec(row.text);
          return { time: m ? m[1] : '', source: 'North Star tick.log', threadTitle: 'North Star factory log', status: 'log', text: redactSensitive(m ? m[2] : row.text).slice(0, 600) };
        }));
      } catch { resolve([]); }
    });
  });
}

async function readHerdrActivity() {
  const envelope = JSON.parse(await runHerdr(['agent', 'list']));
  const agents = envelope?.result?.agents;
  if (!Array.isArray(agents)) throw new Error('Unexpected Herdr agent list.');
  const items: { time: string; source: string; threadTitle: string; status: string; text: string }[] = [];
  for (const agent of agents.slice(0, maxHerdrAgents)) {
    const paneId = String(agent?.pane_id ?? '');
    if (!/^[A-Za-z0-9:_-]{1,80}$/.test(paneId)) continue;
    const engine = String(agent.agent ?? 'agent').slice(0, 40);
    const label = String(agent.name ?? engine).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80);
    const state = String(agent.agent_status ?? 'unknown');
    const status = ['working', 'busy'].includes(state) ? 'in_progress' : state === 'blocked' ? 'blocked' : state === 'idle' ? 'idle' : 'unknown';
    try {
      const output = await runHerdr(['pane', 'read', paneId, '--source', 'recent', '--lines', '200', '--format', 'text']);
      const text = redactSensitive(output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()).slice(-2800);
      if (text) items.push({ time: String(agent.updated_at ?? agent.last_activity_at ?? ''), source: `Herdr ${engine} · ${label}`, threadTitle: `Herdr pane · ${label}`, status, text });
    } catch {
      items.push({ time: String(agent.updated_at ?? agent.last_activity_at ?? ''), source: `Herdr ${engine} · ${label}`, threadTitle: `Herdr pane · ${label}`, status: 'unreadable', text: 'Recent pane output could not be read.' });
    }
  }
  items.push(...await readNorthStarLog());
  return { agents: agents.slice(0, maxHerdrAgents).map((agent: any) => ({ name: String(agent.name ?? agent.agent ?? 'agent').slice(0, 80), engine: String(agent.agent ?? 'agent').slice(0, 40), status: String(agent.agent_status ?? 'unknown') })), items };
}

async function readTail(file: string, limit = 8 * 1024 * 1024): Promise<string> {
  const info = await stat(file);
  if (info.size <= limit) return readFile(file, 'utf8');
  const stream = createReadStream(file, { start: info.size - limit, encoding: 'utf8' });
  let text = '';
  for await (const chunk of stream) text += chunk; // utf8 encoding keeps a multi-byte character that straddles a chunk boundary intact
  return text.slice(text.indexOf('\n') + 1);
}

function goalExcerpt(text: string): string {
  const intent = text.match(goalIntentPattern);
  const at = intent?.index ?? 0;
  const start = Math.max(0, at - 360);
  const excerpt = text.slice(start, start + 1500).trim();
  return `${start ? '…' : ''}${excerpt}${start + excerpt.length < text.length ? '…' : ''}`;
}

async function readOwnerGoals(threads: { id: string; title: string; updatedAt: string }[], files: string[]) {
  const evidence: { id: string; threadId: string; title: string; time: string; text: string; correction: boolean }[] = [];
  let scanned = 0;
  for (const thread of threads) {
    const file = files.find(candidate => path.basename(candidate).endsWith(`-${thread.id}.jsonl`));
    if (!file || !file.startsWith(`${sessionsDir}${path.sep}`)) continue;
    scanned++;
    for (const line of (await readTail(file, 128 * 1024)).split('\n')) {
      try {
        const record = JSON.parse(line);
        const item = record.payload;
        if (record.type !== 'response_item' || item?.type !== 'message' || item.role !== 'user') continue;
        const rawText = itemText(item);
        if (boilerplatePattern.test(rawText) || boilerplatePattern.test(thread.title)) continue;
        const text = rawText.replace(/\s+/g, ' ').trim();
        if (!text || (!goalIntentPattern.test(text) && !correctionPattern.test(text)) || !goalTopicPattern.test(text)) continue;
        const time = String(record.timestamp ?? thread.updatedAt);
        evidence.push({
          id: `${thread.id}:${time}`,
          threadId: thread.id,
          title: thread.title,
          time,
          text: goalExcerpt(text),
          correction: correctionPattern.test(text),
        });
      } catch { /* Skip partial or malformed rollout lines. */ }
    }
  }
  evidence.sort((a, b) => a.time.localeCompare(b.time));
  return {
    coverage: { indexedThreadsChecked: scanned, maxIndexedThreads: 40, historyWindow: 'latest 40 indexed Codex threads only' },
    goals: evidence.slice(-maxOwnerGoals),
  };
}

async function localModelStatus() {
  try {
    const response = await fetch(`${localLlmProxyTarget}/v1/models`, { signal: AbortSignal.timeout(1200) });
    if (!response.ok) return { reachable: false, target: '127.0.0.1:8081', error: `Model endpoint returned ${response.status}.` };
    const data: any = await response.json();
    const models = Array.isArray(data.models) ? data.models.slice(0, 20).map((model: any) => String(model.name ?? model.model ?? '').slice(0, 80)).filter(Boolean) : [];
    return { reachable: models.length > 0, target: '127.0.0.1:8081', models };
  } catch {
    return { reachable: false, target: '127.0.0.1:8081', error: 'Local model endpoint is unavailable.' };
  }
}

async function readThread(thread: { id: string; title: string; updatedAt: string }, file: string) {
  const rows: { time: string; source: string; text: string; ordinal: number; status: string; threadId: string }[] = [];
  let status: 'in_progress' | 'turn_finished' | 'stopped' = 'turn_finished';
  for (const line of (await readTail(file)).split('\n')) {
    try {
      const record = JSON.parse(line);
      const item = record.payload;
      let source = '';
      let text = '';
      if (record.type === 'event_msg' && item?.type === 'task_started') {
        status = 'in_progress'; source = 'Status'; text = 'Turn started.';
      } else if (record.type === 'event_msg' && item?.type === 'task_complete') {
        status = 'turn_finished'; source = 'Status'; text = 'Turn finished; this does not prove the task itself is complete.';
      } else if (record.type === 'event_msg' && item?.type === 'turn_aborted') {
        status = 'stopped'; source = 'Status'; text = 'Turn stopped before completion.';
      } else if (record.type === 'response_item' && item?.type === 'message' && item.role === 'user') {
        source = 'User'; text = itemText(item);
      } else if (record.type === 'response_item' && item?.type === 'message' && item.role === 'assistant' && ['final', 'final_answer', 'commentary'].includes(item.phase)) {
        source = item.phase === 'commentary' ? 'Codex update' : 'Codex'; text = itemText(item);
      } else if (record.type === 'response_item' && item?.type === 'agent_message') {
        source = `Agent ${String(item.author ?? 'unknown').split('/').pop()}`; text = itemText(item);
      } else if (record.type === 'response_item' && item?.type === 'custom_tool_call' && typeof item.name === 'string') {
        source = 'Activity'; text = `Started ${item.name}.`;
      }
      if (text) rows.push({ time: record.timestamp, source, text: text.slice(0, 4000), ordinal: Number(record.ordinal ?? 0), status, threadId: thread.id });
    } catch { /* Skip partial or malformed rollout lines. */ }
  }
  const items = rows.sort((a, b) => a.ordinal - b.ordinal).slice(-12).map(({ ordinal: _ordinal, ...row }) => ({ ...row, threadTitle: thread.title }));
  return { ...thread, status, items };
}

export function codexThreadsPlugin(): Plugin {
  return {
    name: 'codex-readonly-threads',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        let url: URL;
        try { url = new URL(req.url ?? '/', 'http://localhost'); } catch { return respond(res, 400, { error: 'Invalid local API request.' }); }
        if (url.pathname !== '/api/codex/activity' && url.pathname !== '/api/codex/owner-context' && url.pathname !== '/api/herdr/activity' && url.pathname !== '/api/local-model/status' && !url.pathname.startsWith('/api/codex/threads')) return next();
        if (!isLoopback(req) || !isLocalOrigin(req)) {
          return respond(res, 403, { error: 'Local browser access required.' });
        }
        if (req.method !== 'GET') return respond(res, 405, { error: 'Read-only endpoint.' });
        try {
          if (url.pathname === '/api/codex/threads') return respond(res, 200, { threads: await indexThreads() });
          if (url.pathname === '/api/codex/owner-context') return respond(res, 200, await readOwnerGoals(await indexThreads(), await sessionFiles()));
          if (url.pathname === '/api/local-model/status') return respond(res, 200, await localModelStatus());
          if (url.pathname === '/api/codex/activity') {
            const indexedThreads = await indexThreads();
            const threads = indexedThreads.slice(0, maxRecentThreads);
            const files = await sessionFiles();
            const items: any[] = [];
            const statuses: { title: string; status: string; updatedAt: string }[] = [];
            let used = 0;
            for (const thread of threads) {
              const file = files.find(candidate => path.basename(candidate).endsWith(`-${thread.id}.jsonl`));
              if (!file || !file.startsWith(`${sessionsDir}${path.sep}`)) continue;
              const history = await readThread(thread, file);
              statuses.push({ title: thread.title, status: history.status, updatedAt: thread.updatedAt });
              for (const item of history.items) {
                if (used + item.text.length > maxSourceChars) continue;
                used += item.text.length;
                items.push(item);
              }
            }
            items.sort((a, b) => a.time.localeCompare(b.time));
            return respond(res, 200, { threads: statuses, items: items.slice(-160), ownerContext: await readOwnerGoals(indexedThreads, files), capturedAt: new Date().toISOString() });
          }
          if (url.pathname === '/api/herdr/activity') return respond(res, 200, await readHerdrActivity());
          const id = url.pathname.slice('/api/codex/threads/'.length);
          if (!idPattern.test(id)) return respond(res, 400, { error: 'Invalid thread id.' });
          const thread = (await indexThreads()).find(item => item.id === id);
          if (!thread) return respond(res, 404, { error: 'Thread not found in the Codex index.' });
          const files = await sessionFiles();
          const file = files.find(candidate => path.basename(candidate).endsWith(`-${id}.jsonl`));
          if (!file || !file.startsWith(`${sessionsDir}${path.sep}`)) return respond(res, 404, { error: 'Thread history file not found.' });
          return respond(res, 200, await readThread(thread, file));
        } catch {
          return respond(res, 500, { error: 'Could not read local Codex history.' });
        }
      });
    },
  };
}
