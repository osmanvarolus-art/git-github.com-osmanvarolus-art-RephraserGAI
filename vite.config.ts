import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { execFile } from 'node:child_process';
import os from 'node:os';

// Envoy feed: the North Star log stream as plain lines, from the existing ns_feed.py (no new service).
const envoyFeed = () => ({
  name: 'envoy-feed',
  configureServer(server: any) {
    server.middlewares.use('/api/envoy/feed', (req: any, res: any) => {
      const minutes = Math.min(240, Math.max(5, Number(new URL(req.url, 'http://x').searchParams.get('minutes')) || 30));
      execFile('python3', ['-B', `${os.homedir()}/Projects/ns-ratchet/tools/ns_feed.py`, '--minutes', String(minutes)],
        { timeout: 20000, maxBuffer: 8_000_000 }, (err, out) => {
          res.setHeader('content-type', 'application/json');
          if (err) { res.statusCode = 502; res.end(JSON.stringify({ error: 'feed failed' })); return; }
          let log = '';
          try { log = JSON.parse(out).sentences.map((x: any) => x.text).join('\n'); }
          catch { res.statusCode = 502; res.end(JSON.stringify({ error: 'feed not JSON' })); return; }
          // Who is doing what right now, from herdr itself (agent kind, status, pane title), put first so the size cap never drops it.
          execFile('herdr', ['pane', 'list'], { timeout: 8000 }, (e2, o2) => {
            let agents = '';
            try {
              const panes = JSON.parse(o2).result.panes.filter((p: any) => p.agent);
              agents = 'Ajanlar şu an (herdr):\n' + panes.map((p: any) =>
                `[${p.pane_id}] ${p.agent} ${p.agent_status}${p.terminal_title_stripped ? ': ' + p.terminal_title_stripped.replace(/ \| omarchi-os$/, '') : ''}`).join('\n') + '\n\nGünlük:\n';
            } catch { /* herdr unreachable: the log alone still works */ }
            res.end(JSON.stringify({ text: agents + log }));
          });
        });
    });
  },
});


export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/llm': { target: 'http://127.0.0.1:8081', changeOrigin: true, rewrite: (p) => p.replace(/^\/llm/, '') },
          // Anthropic blocks direct browser calls (CORS); the dev server forwards them. The key stays in the browser and is sent per request.
          '/claude': { target: process.env.CLAUDE_UPSTREAM || 'https://api.anthropic.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/claude/, '') },
        },
      },
      plugins: [react(), envoyFeed()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
