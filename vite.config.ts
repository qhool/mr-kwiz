import { readFileSync } from 'node:fs';
import path from 'node:path';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

import { handleAdminEditGet, handleAdminEditPost } from './functions/api/admin/handle-edit';
import {
  handleAdminInvitationDeactivatePost,
  handleAdminInvitationPatch,
  handleAdminInvitationsGet,
  handleAdminInvitationsPost,
} from './functions/api/admin/handle-invitations';

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
const adminInvitationsPattern = /^\/api\/admin\/([^/]+)\/invitations\/?$/;
const adminInvitationDetailPattern = /^\/api\/admin\/([^/]+)\/invitations\/([^/]+)\/?$/;
const adminInvitationDeactivatePattern = /^\/api\/admin\/([^/]+)\/invitations\/([^/]+)\/deactivate\/?$/;

const readRequestBody = async (req: import('node:http').IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve());
    req.on('error', reject);
  });

  return Buffer.concat(chunks);
};

const buildNodeRequest = async (req: import('node:http').IncomingMessage, url: URL, method: string) => {
  const body = await readRequestBody(req);

  return new Request(url.toString(), {
    method,
    headers: new Headers(
      Object.entries(req.headers)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    ),
    body,
  });
};

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    {
      name: 'local-admin-api-middleware',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url ? new URL(req.url, 'http://localhost:3000') : null;
          const deactivateMatch = url?.pathname.match(adminInvitationDeactivatePattern);
          const invitationDetailMatch = url?.pathname.match(adminInvitationDetailPattern);
          const invitationsMatch = url?.pathname.match(adminInvitationsPattern);
          const editMatch = url?.pathname.match(adminEditPattern);

          if (!url) {
            next();
            return;
          }

          const env = readDevVars();

          if (deactivateMatch && req.method === 'POST') {
            const adminKey = decodeURIComponent(deactivateMatch[1]);
            const invitationId = decodeURIComponent(deactivateMatch[2]);
            const response = await handleAdminInvitationDeactivatePost(env, adminKey, invitationId);
            await writeNodeResponse(res, response);
            return;
          }

          if (invitationDetailMatch && req.method === 'PATCH') {
            const adminKey = decodeURIComponent(invitationDetailMatch[1]);
            const invitationId = decodeURIComponent(invitationDetailMatch[2]);
            const request = await buildNodeRequest(req, url, 'PATCH');
            const response = await handleAdminInvitationPatch(env, adminKey, invitationId, request);
            await writeNodeResponse(res, response);
            return;
          }

          if (invitationsMatch) {
            const adminKey = decodeURIComponent(invitationsMatch[1]);

            if (req.method === 'GET') {
              const response = await handleAdminInvitationsGet(env, adminKey);
              await writeNodeResponse(res, response);
              return;
            }

            if (req.method === 'POST') {
              const request = await buildNodeRequest(req, url, 'POST');
              const response = await handleAdminInvitationsPost(env, adminKey, request);
              await writeNodeResponse(res, response);
              return;
            }
          }

          if (!editMatch) {
            next();
            return;
          }

          const adminKey = decodeURIComponent(editMatch[1]);

          if (req.method === 'GET') {
            const response = await handleAdminEditGet(env, adminKey);
            await writeNodeResponse(res, response);
            return;
          }

          if (req.method === 'POST') {
            const request = await buildNodeRequest(req, url, 'POST');

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