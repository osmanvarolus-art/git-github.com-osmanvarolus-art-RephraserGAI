// Fake Anthropic API for offline tests. Validates the same things the real API does:
// x-api-key, anthropic-version, body shape. Records every request for assertions.
import http from 'node:http';

const KEY = 'sk-ant-fake-test-key';
const MODELS = [
  { id: 'claude-opus-fake-1', display_name: 'Claude Opus Fake 1' },
  { id: 'claude-sonnet-fake-2', display_name: 'Claude Sonnet Fake 2' },
  { id: 'claude-sonnet-fake-1', display_name: 'Claude Sonnet Fake 1' },
  { id: 'claude-haiku-fake-1', display_name: 'Claude Haiku Fake 1' },
];
const log = [];

const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  let raw = '';
  req.on('data', c => (raw += c));
  req.on('end', () => {
    if (req.url === '/__log') return send(res, 200, log);
    if (req.headers['x-api-key'] !== KEY) return send(res, 401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
    if (req.headers['anthropic-version'] !== '2023-06-01') return send(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'missing anthropic-version' } });
    if (req.method === 'GET' && req.url.startsWith('/v1/models')) return send(res, 200, { data: MODELS });
    if (req.method === 'POST' && req.url === '/v1/messages') {
      let b; try { b = JSON.parse(raw); } catch { return send(res, 400, { error: { message: 'bad json' } }); }
      log.push({ model: b.model, system: b.system, max_tokens: b.max_tokens, user: b.messages?.[0]?.content });
      if (!MODELS.some(m => m.id === b.model)) return send(res, 404, { type: 'error', error: { type: 'not_found_error', message: `model: ${b.model}` } });
      if (!b.max_tokens || !Array.isArray(b.messages)) return send(res, 400, { error: { message: 'max_tokens and messages required' } });
      return send(res, 200, { content: [{ type: 'text', text: `[${b.model}] rewritten: ${String(b.messages[0].content).slice(-40)}` }] });
    }
    send(res, 404, { error: { message: 'not found' } });
  });
}).listen(8899, '127.0.0.1', () => console.log('fake anthropic on 8899'));
