import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

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

const localApiLogPath = path.resolve(process.cwd(), 'tmp', 'vite-local-api.log');

const logLocalApi = (message: string, error?: unknown) => {
  mkdirSync(path.dirname(localApiLogPath), { recursive: true });
  const timestamp = new Date().toISOString();
  const details = error instanceof Error ? `${error.stack ?? error.message}` : error ? String(error) : '';
  appendFileSync(localApiLogPath, `[${timestamp}] ${message}${details ? `\n${details}` : ''}\n`, 'utf8');
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

const isLocalApiPath = (pathname: string) => {
  return pathname.startsWith('/api/') || pathname === '/mcp' || pathname.startsWith('/.well-known/skills');
};

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    {
      name: 'local-api-middleware',
      configureServer(server) {
        logLocalApi('local-api-middleware configured');
        server.middlewares.use(async (req, res, next) => {
          const requestHost = req.headers.host ?? 'localhost:3000';
          const url = req.url ? new URL(req.url, `http://${requestHost}`) : null;

          if (!url) {
            next();
            return;
          }

          if (!isLocalApiPath(url.pathname)) {
            next();
            return;
          }

          let response: Response | null;
          try {
            const request = await buildNodeRequest(req, url);
            const { routeApiRequest } = await server.ssrLoadModule('/src/worker.ts') as {
              routeApiRequest: (request: Request, env: Record<string, string>) => Promise<Response | null>;
            };
            response = await routeApiRequest(request, readDevVars());
          } catch (error) {
            const message = `${req.method ?? 'GET'} ${url.pathname} failed`;
            console.error(`[local-api-middleware] ${message}`, error);
            logLocalApi(message, error);
            response = new Response(
              JSON.stringify({ error: error instanceof Error ? error.message : 'Local API request failed.' }),
              { headers: { 'content-type': 'application/json; charset=utf-8' }, status: 500 }
            );
          }

          if (response) {
            if (response.status >= 400) {
              const clonedResponse = response.clone();
              const bodyText = await clonedResponse.text().catch(() => '');
              logLocalApi(`${req.method ?? 'GET'} ${url.pathname} returned ${response.status}${bodyText ? ` ${bodyText}` : ''}`);
            }
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
