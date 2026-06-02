import { readFileSync } from 'node:fs';
import path from 'node:path';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

import { routeApiRequest } from './src/worker';

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

const buildNodeRequest = async (req: import('node:http').IncomingMessage, url: URL) => {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve());
    req.on('error', reject);
  });

  const body = Buffer.concat(chunks);

  return new Request(url.toString(), {
    method: req.method ?? 'GET',
    headers: new Headers(
      Object.entries(req.headers)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    ),
    body: body.length > 0 ? body : undefined,
  });
};

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    {
      name: 'local-api-middleware',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const requestHost = req.headers.host ?? 'localhost:3000';
          const url = req.url ? new URL(req.url, `http://${requestHost}`) : null;

          if (!url) {
            next();
            return;
          }

          const request = await buildNodeRequest(req, url);
          const response = await routeApiRequest(request, readDevVars());

          if (response) {
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
      usePolling: true,
      interval: 300,
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