import { type Plugin, tool } from '@opencode-ai/plugin';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

type BridgeAction = 'open_quiz' | 'edit_question' | 'edit_theme' | 'edit_archetypes';

type BridgePayload = {
    action?: BridgeAction;
    definition_version?: number;
    old_question_hash?: string;
    question_id?: string;
    quiz_id?: string;
    quiz_title?: string;
};

type StoredToken = {
    baseUrl: string;
    createdAt: string;
    label?: string;
    token: string;
    tokenHash: string;
};

type ModelConfig = {
    modelID: string;
    providerID: string;
};

type MrKwizConfig = {
    activeTokenHash: string | null;
    defaultModel: ModelConfig | null;
    tokens: StoredToken[];
    version: 1;
};

type MrKwizMcpToolName = 'get_quiz_context' | 'get_question_context' | 'get_edit_capabilities' | 'validate_edit' | 'apply_edit';

type JsonRpcResponse = {
    error?: unknown;
    result?: unknown;
};

const emptyConfig = (): MrKwizConfig => ({ activeTokenHash: null, defaultModel: null, tokens: [], version: 1 });

const parseModel = (value: string): ModelConfig => {
    const trimmed = value.trim();
    const separator = trimmed.indexOf('/');
    if (separator <= 0 || separator === trimmed.length - 1) throw new Error('Model must be in provider/model format, for example anthropic/claude-sonnet-4-6.');
    return {
        modelID: trimmed.slice(separator + 1),
        providerID: trimmed.slice(0, separator),
    };
};

const modelConfigFromInput = (input: { model?: string; model_id?: string; provider_id?: string }): ModelConfig => {
    if (input.model) return parseModel(input.model);
    const modelID = input.model_id?.trim();
    const providerID = input.provider_id?.trim();
    if (!modelID || !providerID) throw new Error('Provide either model as provider/model, or both provider_id and model_id.');
    return { modelID, providerID };
};

const formatModel = (model: ModelConfig | null): string | null => (model ? `${model.providerID}/${model.modelID}` : null);

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const randomToken = (): string => {
    return randomBytes(24).toString('hex');
};

const randomBridgePort = (): number => 61000 + Math.floor(Math.random() * 4536);

const json = (body: unknown, init?: ResponseInit): Response => {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify(body), { ...init, headers });
};

const normalizeBaseUrl = (value?: string): string => (value?.trim() || process.env.MRKWIZ_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

const buildPrompt = (payload: BridgePayload, tokenHash: string): string => {
    const prelude = [
        'The MrKwiz admin UI selected an MCP token and requested AI editing.',
        `Selected MCP token hash: ${tokenHash}`,
        '',
        'First call the skill tool with name "mrkwiz-quiz-edit" to load the MrKwiz saved-edit instructions.',
        'Then use the MrKwiz editing tools for quiz context, validation, and saving. If dynamic mrkwiz.* MCP tools are not visible, use the visible plugin proxy tools: mrkwiz_get_quiz_context, mrkwiz_validate_edit, and mrkwiz_apply_edit.',
        '',
    ];

    switch (payload.action) {
        case 'edit_question':
            return [
                ...prelude,
                `Edit question ${payload.question_id}.`,
                `Quiz title: ${payload.quiz_title ?? 'unknown'}`,
                `Definition version shown in UI: ${payload.definition_version ?? 'unknown'}`,
                `Question ID: ${payload.question_id}`,
                payload.old_question_hash ? `Old question hash from UI: ${payload.old_question_hash}` : '',
                '',
                'Call get_question_context for this question. Ask the user what they want changed. Validate the edit before applying it. Apply only after user confirmation unless the user clearly requested immediate application.',
            ]
                .filter(Boolean)
                .join('\n');
        case 'edit_theme':
            return [
                ...prelude,
                'Edit theme/display settings.',
                'Fetch quiz context, prefer merge_at_path or replace_at_path for display_config/theme_colors edits, validate before applying, and ask for confirmation before saving unless the user clearly requested immediate application.',
            ].join('\n');
        case 'edit_archetypes':
            return [
                ...prelude,
                'Edit archetypes.',
                'Fetch quiz context, use explicit archetype operations, validate before applying, and ask for confirmation before saving unless the user clearly requested immediate application.',
            ].join('\n');
        case 'open_quiz':
        default:
            return [
                ...prelude,
                'Open this quiz for AI editing.',
                'Start by calling mrkwiz_get_quiz_context, summarize the current quiz, then ask what the user wants to work on. If the user only wants conceptual design, load mrkwiz-quiz-design before brainstorming.',
            ].join('\n');
    }
};

const titleForAction = (payload: BridgePayload): string => {
    const quizTitle = payload.quiz_title?.trim() || 'MrKwiz quiz';
    switch (payload.action) {
        case 'edit_question':
            return `MrKwiz: edit ${payload.question_id ?? 'question'} in ${quizTitle}`;
        case 'edit_theme':
            return `MrKwiz: edit theme for ${quizTitle}`;
        case 'edit_archetypes':
            return `MrKwiz: edit archetypes for ${quizTitle}`;
        case 'open_quiz':
        default:
            return `MrKwiz: ${quizTitle}`;
    }
};

export const MrKwizOpenCodePlugin: Plugin = async ({ client, directory }) => {
    const configFile = path.join(process.cwd(), '.opencode', 'mrkwiz.json');
    const legacyTokenFile = path.join(process.cwd(), '.opencode', 'mrkwiz-mcp-token');
    let config = emptyConfig();
    let server: Server | null = null;
    let serverPort = 0;
    const callbackRegistrations = new Map<string, Promise<void>>();
    const registeredCallbackUrls = new Map<string, string>();

    const debug = async (message: string, extra?: Record<string, unknown>) => {
        console.info(`[mrkwiz-opencode-plugin] ${message}`, extra ?? {});
        await client.app
            .log({ body: { service: 'mrkwiz-opencode-plugin', level: 'info', message, extra } })
            .catch((error) => {
                console.error('[mrkwiz-opencode-plugin] failed to write OpenCode app log', error);
            });
    };

    const loadConfig = async (): Promise<MrKwizConfig> => {
        if (!existsSync(configFile)) {
            if (!existsSync(legacyTokenFile)) return emptyConfig();
            const legacyToken = (await readFile(legacyTokenFile, 'utf8')).trim();
            if (!legacyToken) return emptyConfig();
            const tokenHash = hashToken(legacyToken);
            return {
                activeTokenHash: null,
                defaultModel: null,
                tokens: [
                    {
                        baseUrl: normalizeBaseUrl(),
                        createdAt: new Date().toISOString(),
                        label: 'Migrated OpenCode token',
                        token: legacyToken,
                        tokenHash,
                    },
                ],
                version: 1,
            };
        }

        const parsed = JSON.parse(await readFile(configFile, 'utf8')) as Partial<MrKwizConfig>;
        return {
            activeTokenHash: typeof parsed.activeTokenHash === 'string' ? parsed.activeTokenHash : null,
            defaultModel:
                parsed.defaultModel && typeof parsed.defaultModel.providerID === 'string' && typeof parsed.defaultModel.modelID === 'string'
                    ? { modelID: parsed.defaultModel.modelID, providerID: parsed.defaultModel.providerID }
                    : null,
            tokens: Array.isArray(parsed.tokens)
                ? parsed.tokens
                      .filter((entry): entry is StoredToken => !!entry && typeof entry.token === 'string')
                      .map((entry) => ({
                          baseUrl: normalizeBaseUrl(entry.baseUrl),
                          createdAt: entry.createdAt || new Date().toISOString(),
                          label: entry.label,
                          token: entry.token,
                          tokenHash: entry.tokenHash || hashToken(entry.token),
                      }))
                : [],
            version: 1,
        };
    };

    const saveConfig = async () => {
        mkdirSync(path.dirname(configFile), { recursive: true });
        await writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    };

    const tokenCallbackUrl = (tokenHash: string) => `http://127.0.0.1:${serverPort}/mrkwiz/${nonce}/tokens/${tokenHash}`;

    const getOpenCodeMcpStatus = async (): Promise<{ name: string | null; status: string | null }> => {
        try {
            const result = await client.mcp.status({ query: { directory } });
            const servers = (result.data as Record<string, { status?: string }> | undefined) ?? {};
            const name = ['mrkwiz', 'mrkwiz-debug'].find((candidate) => typeof servers[candidate]?.status === 'string') ?? null;
            return { name, status: name ? (servers[name].status ?? null) : null };
        } catch (error) {
            await debug('Failed to read OpenCode MCP status.', { error: error instanceof Error ? error.message : String(error) });
            return { name: null, status: null };
        }
    };

    const publicTokenStatus = (entry: StoredToken, mcp: { name: string | null; status: string | null }) => ({
        active: config.activeTokenHash === entry.tokenHash,
        base_url: entry.baseUrl,
        callback_url: tokenCallbackUrl(entry.tokenHash),
        connected: config.activeTokenHash === entry.tokenHash && mcp.status === 'connected',
        label: entry.label ?? null,
        mcp_name: config.activeTokenHash === entry.tokenHash ? mcp.name : null,
        mcp_status: config.activeTokenHash === entry.tokenHash ? mcp.status : null,
        token_hash: entry.tokenHash,
    });

    const status = async () => {
        await refreshCallbackRegistrations('status');
        const mcp = await getOpenCodeMcpStatus();
        return {
            active_token_hash: config.activeTokenHash,
            base_url: `http://127.0.0.1:${serverPort}`,
            callback_url: `http://127.0.0.1:${serverPort}/mrkwiz/${nonce}`,
            cwd: process.cwd(),
            default_model: formatModel(config.defaultModel),
            directory,
            mcp_name: mcp.name,
            mcp_status: mcp.status,
            running: true,
            supported_actions: ['open_quiz', 'edit_question', 'edit_theme', 'edit_archetypes'],
            tokens: config.tokens.map((entry) => publicTokenStatus(entry, mcp)),
        };
    };

    const activeToken = (): StoredToken => {
        if (!config.activeTokenHash) {
            throw new Error('No active MrKwiz MCP token is selected. Open this quiz from the MrKwiz admin UI or use mrkwiz_bridge_status to inspect token state.');
        }

        const entry = config.tokens.find((token) => token.tokenHash === config.activeTokenHash);
        if (!entry) {
            throw new Error(`Active MrKwiz MCP token hash ${config.activeTokenHash} was not found in local plugin config.`);
        }

        return entry;
    };

    const formatMcpToolResult = (result: unknown): string => {
        if (result && typeof result === 'object' && Array.isArray((result as { content?: unknown }).content)) {
            const content = (result as { content: Array<{ text?: unknown; type?: unknown }> }).content;
            const text = content
                .filter((item) => item?.type === 'text' && typeof item.text === 'string')
                .map((item) => item.text)
                .join('\n');
            if (text) return text;
        }

        return JSON.stringify(result, null, 2);
    };

    const callActiveMcpTool = async (name: MrKwizMcpToolName, args: Record<string, unknown>) => {
        const entry = activeToken();
        await debug('Visible MrKwiz MCP proxy invoked.', { name, token_hash: entry.tokenHash });

        const response = await fetch(`${entry.baseUrl}/mcp`, {
            body: JSON.stringify({
                id: `plugin-proxy-${name}-${Date.now()}`,
                jsonrpc: '2.0',
                method: 'tools/call',
                params: { arguments: args, name },
            }),
            headers: {
                authorization: `Bearer ${entry.token}`,
                'content-type': 'application/json',
            },
            method: 'POST',
        });

        const body = (await response.json().catch(() => ({}))) as JsonRpcResponse;
        if (!response.ok || body.error) {
            throw new Error(JSON.stringify(body.error ?? body));
        }

        return formatMcpToolResult(body.result);
    };

    const registerCallbackOnce = async (entry: StoredToken) => {
        const response = await fetch(`${entry.baseUrl}/mcp`, {
            body: JSON.stringify({
                id: `set-callback-${entry.tokenHash}`,
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                    arguments: {
                        callback_origin: `mrkwiz-opencode-plugin:${entry.tokenHash}`,
                        callback_url: tokenCallbackUrl(entry.tokenHash),
                    },
                    name: 'set_callback_url',
                },
            }),
            headers: {
                authorization: `Bearer ${entry.token}`,
                'content-type': 'application/json',
            },
            method: 'POST',
        });
        const body = (await response.json().catch(() => ({}))) as { error?: unknown };
        if (!response.ok || body.error) throw new Error(JSON.stringify(body.error ?? body));
        return body;
    };

    const registerCallback = async (entry: StoredToken) => {
        let lastError: unknown;
        for (let attempt = 1; attempt <= 8; attempt += 1) {
            try {
                const result = await registerCallbackOnce(entry);
                if (attempt > 1) await debug('Registered callback after retry.', { attempt, token_hash: entry.tokenHash });
                return result;
            } catch (error) {
                lastError = error;
                await debug('Callback registration attempt failed.', {
                    attempt,
                    error: error instanceof Error ? error.message : String(error),
                    token_hash: entry.tokenHash,
                });
                await delay(Math.min(500 * 2 ** (attempt - 1), 5000));
            }
        }
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
    };

    const ensureCallbackRegistered = async (entry: StoredToken, reason: string) => {
        const expectedUrl = tokenCallbackUrl(entry.tokenHash);
        if (registeredCallbackUrls.get(entry.tokenHash) === expectedUrl) return;
        const existing = callbackRegistrations.get(entry.tokenHash);
        if (existing) return existing;

        const task = registerCallback(entry)
            .then(() => {
                registeredCallbackUrls.set(entry.tokenHash, expectedUrl);
                return debug('Registered callback for token.', { callback_url: expectedUrl, reason, token_hash: entry.tokenHash });
            })
            .catch((error) =>
                debug('Failed to register callback for token.', {
                    callback_url: expectedUrl,
                    error: error instanceof Error ? error.message : String(error),
                    reason,
                    token_hash: entry.tokenHash,
                })
            )
            .finally(() => callbackRegistrations.delete(entry.tokenHash));

        callbackRegistrations.set(entry.tokenHash, task);
        return task;
    };

    const refreshCallbackRegistrations = async (reason: string) => {
        await Promise.all(config.tokens.map((entry) => ensureCallbackRegistered(entry, reason)));
    };

    const upsertToken = async (input: { baseUrl?: string; label?: string; token: string }) => {
        const token = input.token.trim();
        if (!token) throw new Error('MCP token is required.');
        const tokenHash = hashToken(token);
        const next: StoredToken = {
            baseUrl: normalizeBaseUrl(input.baseUrl),
            createdAt: new Date().toISOString(),
            label: input.label,
            token,
            tokenHash,
        };
        config.tokens = [next, ...config.tokens.filter((entry) => entry.tokenHash !== tokenHash)];
        await saveConfig();
        await registerCallback(next);
        return next;
    };

    const activateMcp = async (entry: StoredToken) => {
        const current = await getOpenCodeMcpStatus();
        const addResult = await client.mcp.add({
            body: {
                config: {
                    enabled: true,
                    headers: { Authorization: `Bearer ${entry.token}` },
                    oauth: false,
                    type: 'remote',
                    url: `${entry.baseUrl}/mcp`,
                },
                name: 'mrkwiz',
            },
            query: { directory },
        });
        const connectResult = await client.mcp.connect({ path: { name: 'mrkwiz' }, query: { directory } });
        config.activeTokenHash = entry.tokenHash;
        await saveConfig();
        await debug('MCP token activated.', { add_result: addResult.data, connect_result: connectResult.data, directory, previous_status: current, token_hash: entry.tokenHash });
        return { addResult: addResult.data, changed: true, connectResult: connectResult.data };
    };

    const sendPrompt = async (prompt: string, payload: BridgePayload) => {
        const model = config.defaultModel ? { modelID: config.defaultModel.modelID, providerID: config.defaultModel.providerID } : undefined;
        const session = await client.session.create({
            body: { title: titleForAction(payload) },
            query: { directory },
        });
        if (!session.data?.id) {
            await debug('OpenCode session.create did not return a session id.', { response: session.response, data: session.data });
            throw new Error('OpenCode did not return a session id.');
        }

        await client.session.promptAsync({
            body: {
                model,
                parts: [{ text: prompt, type: 'text' }],
            },
            path: { id: session.data.id },
            query: { directory },
        });

        await debug('Created MrKwiz OpenCode session.', { session_id: session.data.id, title: titleForAction(payload) });
        return session.data;
    };

    await debug('Plugin initializing.', {
        config_file: configFile,
        cwd: process.cwd(),
        node_version: process.version,
    });

    config = await loadConfig();
    await saveConfig();

    const nonce = randomToken();
    const allowedOrigins = new Set<string>();
    const configuredOrigin = process.env.MRKWIZ_ORIGIN?.trim();
    if (configuredOrigin) allowedOrigins.add(configuredOrigin.replace(/\/$/, ''));

    const addCors = (request: Request, response: Response): Response => {
        const origin = request.headers.get('origin');
        if (!origin) return response;
        if (allowedOrigins.size > 0 && !allowedOrigins.has(origin.replace(/\/$/, ''))) return response;
        const headers = new Headers(response.headers);
        headers.set('access-control-allow-origin', origin);
        headers.set('access-control-allow-headers', 'content-type');
        headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
        return new Response(response.body, { headers, status: response.status, statusText: response.statusText });
    };

    const route = async (request: Request): Promise<Response> => {
        const url = new URL(request.url);
        const prefix = `/mrkwiz/${nonce}`;
        if (!url.pathname.startsWith(prefix)) return json({ error: 'Not found.' }, { status: 404 });
        if (request.method === 'OPTIONS') return addCors(request, new Response(null, { status: 204 }));

        if (url.pathname === `${prefix}/health` && request.method === 'GET') return addCors(request, json({ ok: true }));
        if (url.pathname === `${prefix}/status` && request.method === 'GET') return addCors(request, json(await status()));

        const match = url.pathname.match(new RegExp(`^${prefix}/tokens/([a-f0-9]{64})(?:/([^/]+))?/?$`));
        if (!match) return addCors(request, json({ error: 'Unknown MrKwiz bridge path.' }, { status: 404 }));
        const tokenHash = match[1];
        const suffix = match[2] ?? '';
        const entry = config.tokens.find((token) => token.tokenHash === tokenHash);
        if (!entry) return addCors(request, json({ error: 'Unknown MrKwiz MCP token hash.' }, { status: 404 }));

        if (request.method === 'GET' && suffix === 'status') {
            await ensureCallbackRegistered(entry, 'token-status');
            return addCors(request, json(publicTokenStatus(entry, await getOpenCodeMcpStatus())));
        }
        if (request.method !== 'POST') return addCors(request, json({ error: 'Method not allowed.' }, { status: 405 }));

        const actionByPath: Record<string, BridgeAction> = {
            'edit-archetypes': 'edit_archetypes',
            'edit-question': 'edit_question',
            'edit-theme': 'edit_theme',
            'open-quiz': 'open_quiz',
        };
        const action = actionByPath[suffix];
        if (!action) return addCors(request, json({ error: 'Unknown MrKwiz bridge action.' }, { status: 404 }));

        await ensureCallbackRegistered(entry, action);
        const activation = await activateMcp(entry);
        const payload = { ...((await request.json().catch(() => ({}))) as BridgePayload), action };
        const prompt = buildPrompt(payload, tokenHash);
        const session = await sendPrompt(prompt, payload);
        await client.tui.showToast({
            body: {
                message: activation.changed ? 'MrKwiz MCP activated and prompt sent to OpenCode.' : 'MrKwiz prompt sent to OpenCode.',
                variant: 'success',
            },
        });
        return addCors(request, json({ ok: true, active_token_hash: config.activeTokenHash, session_id: session.id }));
    };

    await debug('Starting bridge HTTP server.');
    const createBridgeServer = () =>
        createServer((incoming, outgoing) => {
            const chunks: Buffer[] = [];
            incoming.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            incoming.on('error', () => {
                outgoing.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
                outgoing.end(JSON.stringify({ error: 'Request stream failed.' }));
            });
            incoming.on('end', async () => {
                try {
                    const requestUrl = new URL(incoming.url ?? '/', `http://${incoming.headers.host ?? '127.0.0.1'}`);
                    const headers = new Headers();
                    for (const [key, value] of Object.entries(incoming.headers)) {
                        if (Array.isArray(value)) for (const item of value) headers.append(key, item);
                        else if (value !== undefined) headers.set(key, value);
                    }
                    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
                    const response = await route(new Request(requestUrl, { body, headers, method: incoming.method }));
                    const responseHeaders: Record<string, string> = {};
                    response.headers.forEach((value, key) => {
                        responseHeaders[key] = value;
                    });
                    outgoing.writeHead(response.status, responseHeaders);
                    outgoing.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
                } catch (error) {
                    outgoing.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
                    outgoing.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Bridge request failed.' }));
                }
            });
        });

    for (let attempt = 1; attempt <= 20; attempt += 1) {
        server = createBridgeServer();
        const port = randomBridgePort();
        try {
            await new Promise<void>((resolve, reject) => {
                const onError = (error: Error) => reject(error);
                server?.once('error', onError);
                server?.listen({ host: '127.0.0.1', port }, () => {
                    server?.off('error', onError);
                    const address = server?.address();
                    if (address && typeof address === 'object') serverPort = address.port;
                    resolve();
                });
            });
            break;
        } catch (error) {
            server.close();
            server = null;
            await debug('Bridge HTTP server failed to start.', { attempt, error: error instanceof Error ? error.message : String(error), port });
            if (attempt === 20) throw error;
        }
    }

    if (!server || serverPort === 0) throw new Error('MrKwiz bridge server did not start.');

    await debug('Bridge HTTP server started.', {
        base_url: `http://127.0.0.1:${serverPort}`,
        callback_url: `http://127.0.0.1:${serverPort}/mrkwiz/${nonce}`,
        running: true,
        token_count: config.tokens.length,
    });
    await refreshCallbackRegistrations('startup');

    const configureToken = async (args: { base_url?: string; label?: string; token: string }) => {
        await debug('mrkwiz_configure_mcp invoked.', { base_url: args.base_url, token_length: args.token?.length ?? 0 });
        const entry = await upsertToken({ baseUrl: args.base_url, label: args.label, token: args.token });
        return {
            ok: true,
            active_token_hash: config.activeTokenHash,
            callback_url: tokenCallbackUrl(entry.tokenHash),
            config_file: configFile,
            note: 'Token saved locally and callback registered. MrKwiz MCP will activate when a MrKwiz bridge action selects this token.',
            token_hash: entry.tokenHash,
        };
    };

    const configureDefaultModel = async (args: { model?: string; model_id?: string; provider_id?: string }) => {
        const model = modelConfigFromInput(args);
        config.defaultModel = model;
        await saveConfig();
        await debug('Configured MrKwiz default model.', { model: formatModel(model) });
        return {
            ok: true,
            config_file: configFile,
            default_model: formatModel(model),
            model_id: model.modelID,
            note: 'MrKwiz plugin will use this model for new sessions created from MrKwiz admin UI actions.',
            provider_id: model.providerID,
        };
    };

    return {
        async dispose() {
            await debug('Plugin disposing.');
            server?.close();
        },
        tool: {
            mrkwiz_bridge_status: tool({
                args: {},
                description: 'Discover the local MrKwiz OpenCode bridge status, configured default model, token hashes, callback URLs, and active MCP token hash.',
                async execute() {
                    const currentStatus = await status();
                    await debug('mrkwiz_bridge_status invoked.', currentStatus);
                    return JSON.stringify(currentStatus, null, 2);
                },
            }),
            mrkwiz_get_quiz_context: tool({
                args: {},
                description: 'Visible plugin proxy for mrkwiz.get_quiz_context. Gets the current quiz context for the active MrKwiz MCP token.',
                async execute() {
                    return callActiveMcpTool('get_quiz_context', {});
                },
            }),
            mrkwiz_get_question_context: tool({
                args: {
                    question_id: tool.schema.string().describe('Question ID to fetch, required before replacing or deleting that question.'),
                },
                description: 'Visible plugin proxy for mrkwiz.get_question_context. Gets a full question, trait order, and old_question_hash for safe editing.',
                async execute(args) {
                    return callActiveMcpTool('get_question_context', args);
                },
            }),
            mrkwiz_get_edit_capabilities: tool({
                args: {},
                description: 'Visible plugin proxy for mrkwiz.get_edit_capabilities. Lists supported edit operations for the active quiz state.',
                async execute() {
                    return callActiveMcpTool('get_edit_capabilities', {});
                },
            }),
            mrkwiz_validate_edit: tool({
                args: {
                    patch: tool.schema.any().describe('QuizEditPatch object to validate without saving.'),
                },
                description: 'Visible plugin proxy for mrkwiz.validate_edit. Validates a QuizEditPatch against the active quiz without saving it.',
                async execute(args) {
                    return callActiveMcpTool('validate_edit', args);
                },
            }),
            mrkwiz_apply_edit: tool({
                args: {
                    patch: tool.schema.any().describe('Validated QuizEditPatch object to apply to the active quiz.'),
                },
                description: 'Visible plugin proxy for mrkwiz.apply_edit. Applies a validated QuizEditPatch to the active quiz.',
                async execute(args) {
                    return callActiveMcpTool('apply_edit', args);
                },
            }),
            mrkwiz_configure_mcp: tool({
                args: {
                    base_url: tool.schema.string().optional().describe('MrKwiz site base URL. Defaults to MRKWIZ_BASE_URL or http://localhost:3000.'),
                    label: tool.schema.string().optional().describe('Optional local label for this MrKwiz MCP token.'),
                    token: tool.schema.string().describe('Raw MrKwiz MCP token from the admin AI bootstrap page.'),
                },
                description: 'Save a MrKwiz MCP token locally and register a token-hash callback URL. MCP activates later when the callback is used.',
                async execute(args) {
                    return JSON.stringify(await configureToken(args), null, 2);
                },
            }),
            mrkwiz_configure_default_model: tool({
                args: {
                    model: tool.schema.string().optional().describe('OpenCode model in provider/model format, for example anthropic/claude-sonnet-4-6.'),
                    model_id: tool.schema.string().optional().describe('OpenCode model ID. Use with provider_id if model is not provided.'),
                    provider_id: tool.schema.string().optional().describe('OpenCode provider ID. Use with model_id if model is not provided.'),
                },
                description: 'Set the default OpenCode model that MrKwiz plugin uses when creating new sessions from MrKwiz admin UI actions.',
                async execute(args) {
                    return JSON.stringify(await configureDefaultModel(args), null, 2);
                },
            }),
        },
        async event(input) {
            if (input.event.type === 'server.connected') await debug('server.connected event received.');
        },
    };
};

export default MrKwizOpenCodePlugin;
