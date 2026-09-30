import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { codexThreadsPlugin, localLlmProxyTarget } from './codexThreads';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '127.0.0.1', // the /llm and /claude proxies must not be reachable from the LAN
        proxy: {
          '/llm': { target: localLlmProxyTarget, changeOrigin: true, rewrite: (p) => p.replace(/^\/llm/, '') },
          // Anthropic blocks direct browser calls (CORS); the dev server forwards them. The key stays in the browser and is sent per request.
          '/claude': { target: process.env.CLAUDE_UPSTREAM || 'https://api.anthropic.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/claude/, '') },
        },
      },
      plugins: [react(), codexThreadsPlugin()],
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
