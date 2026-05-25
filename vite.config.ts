import { readFileSync } from 'node:fs';
import path from 'node:path';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

import { handleAdminEditGet, handleAdminEditPost } from './functions/api/admin/handle-edit';

const readDevVars = () => {
  const devVarsPath = path.resolve(process.cwd(), '.dev.vars');

  try {
    const contents = readFileSync(devVarsPath, 'utf8');

    return Object.fromEntries(
      contents
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
        .map((line) => {
          const separatorIndex = line.indexOf('=');
          const key = line.slice(0, separatorIndex);
          const value = line.slice(separatorIndex + 1);
          return [key, value];
        })
    );
  } catch {
    return {};
  }
};

const writeNodeResponse = async (
  nodeResponse: import('node:http').ServerResponse,
  response: Response
) => {
  nodeResponse.statusCode = response.status;
  response.headers.forEach((value, key) => {
    nodeResponse.setHeader(key, value);
  });

  const body = Buffer.from(await response.arrayBuffer());
  nodeResponse.end(body);
};

const adminEditPattern = /^\/api\/admin\/([^/]+)\/edit\/?$/;

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    {
      name: 'local-admin-api-middleware',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url ? new URL(req.url, 'http://localhost:3000') : null;
          const match = url?.pathname.match(adminEditPattern);

          if (!url || !match) {
            next();
            return;
          }

          const env = readDevVars();
          const adminKey = decodeURIComponent(match[1]);

          if (req.method === 'GET') {
            const response = await handleAdminEditGet(env, adminKey);
            await writeNodeResponse(res, response);
            return;
          }

          if (req.method === 'POST') {
            const chunks: Buffer[] = [];
            await new Promise<void>((resolve, reject) => {
              req.on('data', (chunk) => {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
              });
              req.on('end', () => resolve());
              req.on('error', reject);
            });

            const request = new Request(url.toString(), {
              method: 'POST',
              headers: new Headers(
                Object.entries(req.headers)
                  .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
              ),
              body: Buffer.concat(chunks),
            });

            const response = await handleAdminEditPost(env, adminKey, request);
            await writeNodeResponse(res, response);
            return;
          }

          next();
        });
      },
    },
  ],
  server: {
    port: 3000,
    open: true,
    watch: {
      ignored: ['**/.wrangler/**'],
    },
  },
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});