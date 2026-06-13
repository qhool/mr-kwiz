import { type Plugin, tool } from '@opencode-ai/plugin';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

type BridgeAction = 'open_quiz' | 'edit_question' | 'edit_theme' | 'edit_archetypes' | 'edit_intro' | 'edit_scoring';

type BridgePayload = {
    action?: BridgeAction;
    definition_version?: number;
    old_question_hash?: string;
    question_id?: string;
    quiz_id?: string;
    quiz_title?: string;
};

type BridgeRequest = {
    action: BridgeAction;
    payload: BridgePayload;
    tokenHash: string;
};

type DiagnosticCheck = {
    details?: Record<string, unknown>;
    message: string;
    ok: boolean;
};

type DiagnosticReport = {
    checks: DiagnosticCheck[];
    ok: boolean;
    token_hash: string;
};

type PendingBridgeRequest = BridgeRequest & {
    createdAt: string;
    diagnosticReport?: DiagnosticReport;
};

type StoredToken = {
    baseUrl: string;
    createdAt: string;
    label?: string;
    mcpName: string;
    pendingRequest?: PendingBridgeRequest | null;
    quiz?: {
        id?: string;
        title?: string;
    };
    session?: {
        createdAt: string;
        id: string;
        lastAction?: BridgeAction;
        quizId?: string;
        quizTitle?: string;
        updatedAt: string;
    };
    token: string;
    tokenHash: string;
    updatedAt: string;
};

type StoredQuizSession = {
    createdAt: string;
    quizId: string;
    quizTitle?: string;
    sessionId: string;
    updatedAt: string;
};

type ModelConfig = {
    modelID: string;
    providerID: string;
};

type MrKwizConfig = {
    defaultModel: ModelConfig | null;
    tokens: Record<string, StoredToken>;
    version: 2;
};

type MrKwizMcpToolName = 'get_quiz_context' | 'get_question_context' | 'search_questions' | 'get_edit_capabilities' | 'validate_edit' | 'apply_edit';

type JsonRpcResponse = {
    error?: unknown;
    result?: unknown;
};

export type CapturedSystemPrompt = {
    capturedAt: string;
    mcpName?: string;
    sessionID: string;
    system: string[];
    tokenHash?: string;
};

export type CapturedToolDefinition = {
    capturedAt: string;
    description: string;
    parameters?: unknown;
    toolID: string;
};

const emptyConfig = (): MrKwizConfig => ({ defaultModel: null, tokens: {}, version: 2 });

const isBridgeAction = (value: unknown): value is BridgeAction => {
    return value === 'open_quiz' || value === 'edit_question' || value === 'edit_theme' || value === 'edit_archetypes' || value === 'edit_intro' || value === 'edit_scoring';
};

const parsePendingRequest = (value: unknown): PendingBridgeRequest | null => {
    if (!value || typeof value !== 'object') return null;
    const input = value as Partial<PendingBridgeRequest>;
    if (!isBridgeAction(input.action)) return null;
    if (!input.payload || typeof input.payload !== 'object') return null;
    if (typeof input.tokenHash !== 'string' || !input.tokenHash) return null;
    if (typeof input.createdAt !== 'string' || !input.createdAt) return null;
    return {
        action: input.action,
        createdAt: input.createdAt,
        diagnosticReport: input.diagnosticReport,
        payload: input.payload,
        tokenHash: input.tokenHash,
    };
};

const parseQuizSessions = (value: unknown): Record<string, StoredQuizSession> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const sessions: Record<string, StoredQuizSession> = {};

    for (const [quizId, rawSession] of Object.entries(value as Record<string, unknown>)) {
        if (!rawSession || typeof rawSession !== 'object' || Array.isArray(rawSession)) continue;
        const input = rawSession as Partial<StoredQuizSession>;
        const sessionQuizId = typeof input.quizId === 'string' && input.quizId ? input.quizId : quizId;
        if (!sessionQuizId || typeof input.sessionId !== 'string' || !input.sessionId) continue;
        const now = new Date().toISOString();
        sessions[sessionQuizId] = {
            createdAt: typeof input.createdAt === 'string' && input.createdAt ? input.createdAt : now,
            quizId: sessionQuizId,
            quizTitle: typeof input.quizTitle === 'string' ? input.quizTitle : undefined,
            sessionId: input.sessionId,
            updatedAt: typeof input.updatedAt === 'string' && input.updatedAt ? input.updatedAt : now,
        };
    }

    return sessions;
};

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

const mcpNameForTokenHash = (tokenHash: string): string => `mrkwiz_${tokenHash.slice(0, 12)}`;

const tokenEntries = (config: MrKwizConfig): StoredToken[] => Object.values(config.tokens);

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

const formatDiagnosticReport = (report: DiagnosticReport): string => JSON.stringify(report, null, 2);

const formatPendingRequest = (request: BridgeRequest | PendingBridgeRequest): string => {
    return JSON.stringify(
        {
            action: request.action,
            payload: request.payload,
            token_hash: request.tokenHash,
            ...('createdAt' in request ? { created_at: request.createdAt } : {}),
        },
        null,
        2
    );
};

const buildDesignPrompt = (request: BridgeRequest, diagnostics: DiagnosticReport): string => {
    void diagnostics;

    const lines = [
        'The MrKwiz admin UI opened the current quiz for AI assistance.',
        'First call the skill tool with name "mrkwiz-quiz-design".',
        'Follow that skill to inspect the current quiz, describe its state, and ask the user what they want to work on.',
    ];

    switch (request.action) {
        case 'edit_question':
            return [
                ...lines,
                request.payload.question_id ? `The user clicked a question-focused action for question ${request.payload.question_id}.` : '',
                '',
            ]
                .filter(Boolean)
                .join('\n');
        case 'edit_theme':
            return [
                ...lines,
                'The user clicked a theme/display-focused action.',
            ].join('\n');
        case 'edit_intro':
            return [
                ...lines,
                'The user clicked an intro/title/description-focused action.',
            ].join('\n');
        case 'edit_scoring':
            return [
                ...lines,
                'The user clicked a scoring/results-display-focused action.',
            ].join('\n');
        case 'edit_archetypes':
            return [
                ...lines,
                'The user clicked an archetype-focused action.',
            ].join('\n');
        case 'open_quiz':
        default:
            return lines.join('\n');
    }
};

const buildSetupPrompt = (request: PendingBridgeRequest, diagnostics: DiagnosticReport): string => {
    return [
        'The MrKwiz admin UI selected an MCP token and requested quiz work, but connection diagnostics failed.',
        '',
        'First call the skill tool with name "mrkwiz-opencode-setup" to load the MrKwiz setup/troubleshooting instructions.',
        'Resolve the diagnostic failures. When issues are resolved, call mrkwiz_do_pending_request to continue the original user request without asking the user to click the admin UI again.',
        '',
        `Pending request created at: ${request.createdAt}`,
        'Pending user request:',
        formatPendingRequest(request),
        '',
        'Diagnostic report:',
        formatDiagnosticReport(diagnostics),
    ].join('\n');
};

const titleForAction = (payload: BridgePayload): string => {
    const quizTitle = payload.quiz_title?.trim() || 'MrKwiz quiz';
    switch (payload.action) {
        case 'edit_question':
            return `MrKwiz: edit ${payload.question_id ?? 'question'} in ${quizTitle}`;
        case 'edit_theme':
            return `MrKwiz: edit theme for ${quizTitle}`;
        case 'edit_intro':
            return `MrKwiz: edit intro for ${quizTitle}`;
        case 'edit_scoring':
            return `MrKwiz: edit scoring for ${quizTitle}`;
        case 'edit_archetypes':
            return `MrKwiz: edit archetypes for ${quizTitle}`;
        case 'open_quiz':
        default:
            return `MrKwiz: ${quizTitle}`;
    }
};

const MRKWIZ_MCP_TOOLS_START = '<mrkwiz_mcp_tools>';
const MRKWIZ_MCP_TOOLS_END = '</mrkwiz_mcp_tools>';

export const mcpToolId = (entry: Pick<StoredToken, 'mcpName'>, toolName: MrKwizMcpToolName): string => `${entry.mcpName}_${toolName}`;

export const mcpToolReference = (entry: Pick<StoredToken, 'mcpName'>, toolName: MrKwizMcpToolName): string => `functions.${mcpToolId(entry, toolName)}`;

export const buildMcpSystemPrompt = (entry: Pick<StoredToken, 'mcpName'>): string => [
    MRKWIZ_MCP_TOOLS_START,
    '## MrKwiz MCP Tools',
    '',
    `This OpenCode session is bound to MrKwiz MCP server \`${entry.mcpName}\`.`,
    '',
    'Use these exact OpenCode tool names for this quiz:',
    `- \`${mcpToolReference(entry, 'get_quiz_context')}\``,
    `- \`${mcpToolReference(entry, 'search_questions')}\``,
    `- \`${mcpToolReference(entry, 'get_question_context')}\``,
    `- \`${mcpToolReference(entry, 'get_edit_capabilities')}\``,
    `- \`${mcpToolReference(entry, 'validate_edit')}\``,
    `- \`${mcpToolReference(entry, 'apply_edit')}\``,
    MRKWIZ_MCP_TOOLS_END,
].join('\n');

export const upsertMcpSystemPrompt = (system: string, entry: Pick<StoredToken, 'mcpName'>): string => {
    const section = buildMcpSystemPrompt(entry);
    const start = system.indexOf(MRKWIZ_MCP_TOOLS_START);
    if (start === -1) return system ? `${system.trimEnd()}\n\n${section}` : section;

    const end = system.indexOf(MRKWIZ_MCP_TOOLS_END, start);
    if (end === -1) return system.includes(section) ? system : `${system.trimEnd()}\n\n${section}`;

    const before = system.slice(0, start).trimEnd();
    const after = system.slice(end + MRKWIZ_MCP_TOOLS_END.length).trimStart();
    return [before, section, after].filter(Boolean).join('\n\n');
};

export const injectMcpSystemPrompt = (system: string[], entry: Pick<StoredToken, 'mcpName'>): void => {
    if (system.length === 0) {
        system.push(buildMcpSystemPrompt(entry));
        return;
    }
    system[0] = upsertMcpSystemPrompt(system[0], entry);
};

export const captureSystemPrompt = (captures: Map<string, CapturedSystemPrompt>, prompt: CapturedSystemPrompt): CapturedSystemPrompt => {
    const captured = { ...prompt, system: [...prompt.system] };
    captures.set(prompt.sessionID, captured);
    return captured;
};

export const getCapturedSystemPrompt = (captures: Map<string, CapturedSystemPrompt>, sessionID: string): CapturedSystemPrompt | undefined => captures.get(sessionID);

const cloneJsonLike = (value: unknown): unknown => {
    if (value === undefined) return undefined;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return String(value);
    }
};

export const captureToolDefinition = (captures: Map<string, CapturedToolDefinition>, toolDefinition: CapturedToolDefinition): CapturedToolDefinition => {
    const captured = { ...toolDefinition, parameters: cloneJsonLike(toolDefinition.parameters) };
    captures.set(toolDefinition.toolID, captured);
    return captured;
};

export const getCapturedToolDefinitions = (captures: Map<string, CapturedToolDefinition>, options: { includeParameters?: boolean; prefix?: string } = {}) => {
    const prefix = options.prefix?.trim();
    return [...captures.values()]
        .filter((definition) => !prefix || definition.toolID.startsWith(prefix))
        .sort((a, b) => a.toolID.localeCompare(b.toolID))
        .map((definition) => ({
            captured_at: definition.capturedAt,
            description: definition.description,
            ...(options.includeParameters ? { parameters: definition.parameters } : {}),
            tool_id: definition.toolID,
        }));
};

export const MrKwizOpenCodePlugin: Plugin = async ({ client, directory }) => {
    const configFile = path.join(process.cwd(), '.opencode', 'mrkwiz.json');
    const legacyTokenFile = path.join(process.cwd(), '.opencode', 'mrkwiz-mcp-token');
    let config = emptyConfig();
    let server: Server | null = null;
    let serverPort = 0;
    const callbackRegistrations = new Map<string, Promise<void>>();
    const capturedSystemPrompts = new Map<string, CapturedSystemPrompt>();
    const capturedToolDefinitions = new Map<string, CapturedToolDefinition>();
    const registeredCallbackUrls = new Map<string, string>();
    const debugStdout = process.env.MRKWIZ_PLUGIN_DEBUG_STDOUT === '1';

    const debug = async (message: string, extra?: Record<string, unknown>) => {
        if (debugStdout) console.info(`[mrkwiz-opencode-plugin] ${message}`, extra ?? {});
        await client.app
            .log({ body: { service: 'mrkwiz-opencode-plugin', level: 'info', message, extra } })
            .catch(() => {});
    };

    const loadConfig = async (): Promise<MrKwizConfig> => {
        const normalizeTokenEntry = (entry: Partial<StoredToken> & { token: string }): StoredToken => {
            const now = new Date().toISOString();
            const tokenHash = entry.tokenHash || hashToken(entry.token);
            return {
                baseUrl: normalizeBaseUrl(entry.baseUrl),
                createdAt: entry.createdAt || now,
                label: entry.label,
                mcpName: entry.mcpName || mcpNameForTokenHash(tokenHash),
                pendingRequest: parsePendingRequest(entry.pendingRequest),
                quiz: entry.quiz && typeof entry.quiz === 'object' ? entry.quiz : undefined,
                session: entry.session && typeof entry.session.id === 'string'
                    ? {
                          createdAt: entry.session.createdAt || now,
                          id: entry.session.id,
                          lastAction: isBridgeAction(entry.session.lastAction) ? entry.session.lastAction : undefined,
                          quizId: entry.session.quizId,
                          quizTitle: entry.session.quizTitle,
                          updatedAt: entry.session.updatedAt || now,
                      }
                    : undefined,
                token: entry.token,
                tokenHash,
                updatedAt: entry.updatedAt || now,
            };
        };

        const tokensByHash = (entries: StoredToken[]): Record<string, StoredToken> =>
            Object.fromEntries(entries.map((entry) => [entry.tokenHash, entry]));

        if (!existsSync(configFile)) {
            if (!existsSync(legacyTokenFile)) return emptyConfig();
            const legacyToken = (await readFile(legacyTokenFile, 'utf8')).trim();
            if (!legacyToken) return emptyConfig();
            const tokenHash = hashToken(legacyToken);
            const now = new Date().toISOString();
            const entry = normalizeTokenEntry({
                baseUrl: normalizeBaseUrl(),
                createdAt: now,
                label: 'Migrated OpenCode token',
                token: legacyToken,
                tokenHash,
                updatedAt: now,
            });
            return {
                defaultModel: null,
                tokens: { [tokenHash]: entry },
                version: 2,
            };
        }

        const parsed = JSON.parse(await readFile(configFile, 'utf8')) as Partial<MrKwizConfig> & {
            activeTokenHash?: unknown;
            pendingRequest?: unknown;
            quizSessions?: unknown;
            tokens?: unknown;
            version?: unknown;
        };
        const parsedTokens = Array.isArray(parsed.tokens)
            ? parsed.tokens
                  .filter((entry): entry is Partial<StoredToken> & { token: string } => !!entry && typeof entry === 'object' && typeof (entry as { token?: unknown }).token === 'string')
                  .map(normalizeTokenEntry)
            : parsed.tokens && typeof parsed.tokens === 'object'
              ? Object.values(parsed.tokens as Record<string, unknown>)
                    .filter((entry): entry is Partial<StoredToken> & { token: string } => !!entry && typeof entry === 'object' && typeof (entry as { token?: unknown }).token === 'string')
                    .map(normalizeTokenEntry)
              : [];

        const legacySessions = parseQuizSessions(parsed.quizSessions);
        if (parsedTokens.length === 1 && Object.keys(legacySessions).length === 1 && !parsedTokens[0]!.session) {
            const legacySession = Object.values(legacySessions)[0]!;
            parsedTokens[0]!.quiz = { id: legacySession.quizId, title: legacySession.quizTitle };
            parsedTokens[0]!.session = {
                createdAt: legacySession.createdAt,
                id: legacySession.sessionId,
                quizId: legacySession.quizId,
                quizTitle: legacySession.quizTitle,
                updatedAt: legacySession.updatedAt,
            };
        }

        if (parsed.pendingRequest && parsedTokens.length === 1 && !parsedTokens[0]!.pendingRequest) {
            parsedTokens[0]!.pendingRequest = parsePendingRequest(parsed.pendingRequest);
        }

        return {
            defaultModel:
                parsed.defaultModel && typeof parsed.defaultModel.providerID === 'string' && typeof parsed.defaultModel.modelID === 'string'
                    ? { modelID: parsed.defaultModel.modelID, providerID: parsed.defaultModel.providerID }
                    : null,
            tokens: tokensByHash(parsedTokens),
            version: 2,
        };
    };

    const saveConfig = async () => {
        mkdirSync(path.dirname(configFile), { recursive: true });
        await writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    };

    const tokenCallbackUrl = (tokenHash: string) => `http://127.0.0.1:${serverPort}/mrkwiz/${nonce}/tokens/${tokenHash}`;

    const getOpenCodeMcpStatus = async (name?: string): Promise<{ name: string | null; status: string | null }> => {
        try {
            const result = await client.mcp.status({ query: { directory } });
            const servers = (result.data as Record<string, { status?: string }> | undefined) ?? {};
            const mcpName = name ?? ['mrkwiz', 'mrkwiz-debug'].find((candidate) => typeof servers[candidate]?.status === 'string') ?? null;
            return { name: mcpName, status: mcpName ? (servers[mcpName]?.status ?? null) : null };
        } catch (error) {
            await debug('Failed to read OpenCode MCP status.', { error: error instanceof Error ? error.message : String(error) });
            return { name: null, status: null };
        }
    };

    const publicTokenStatus = async (entry: StoredToken) => {
        const mcp = await getOpenCodeMcpStatus(entry.mcpName);
        return {
            base_url: entry.baseUrl,
            callback_url: tokenCallbackUrl(entry.tokenHash),
            connected: mcp.status === 'connected',
            label: entry.label ?? null,
            mcp_name: entry.mcpName,
            mcp_status: mcp.status,
            pending_request: entry.pendingRequest
                ? {
                      action: entry.pendingRequest.action,
                      created_at: entry.pendingRequest.createdAt,
                      token_hash: entry.pendingRequest.tokenHash,
                  }
                : null,
            session: entry.session
                ? {
                      id: entry.session.id,
                      quiz_id: entry.session.quizId ?? entry.quiz?.id ?? null,
                      quiz_title: entry.session.quizTitle ?? entry.quiz?.title ?? null,
                      updated_at: entry.session.updatedAt,
                  }
                : null,
            token_hash: entry.tokenHash,
        };
    };

    const status = async () => {
        refreshCallbackRegistrations('status');
        const mcpStatuses = await Promise.all(tokenEntries(config).map(publicTokenStatus));
        return {
            base_url: `http://127.0.0.1:${serverPort}`,
            callback_url: `http://127.0.0.1:${serverPort}/mrkwiz/${nonce}`,
            cwd: process.cwd(),
            default_model: formatModel(config.defaultModel),
            directory,
            running: true,
            supported_actions: ['open_quiz', 'edit_question', 'edit_theme', 'edit_archetypes', 'edit_intro', 'edit_scoring'],
            tokens: mcpStatuses,
        };
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

    const callMcpTool = async (entry: StoredToken, name: MrKwizMcpToolName, args: Record<string, unknown>) => {
        const response = await fetch(`${entry.baseUrl}/mcp`, {
            body: JSON.stringify({
                id: `plugin-internal-${name}-${Date.now()}`,
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

    const scheduleCallbackRegistration = (entry: StoredToken, reason: string) => {
        void ensureCallbackRegistered(entry, reason).catch((error) =>
            debug('Failed to schedule callback registration.', {
                error: error instanceof Error ? error.message : String(error),
                reason,
                token_hash: entry.tokenHash,
            })
        );
    };

    const refreshCallbackRegistrations = (reason: string) => {
        for (const entry of tokenEntries(config)) {
            scheduleCallbackRegistration(entry, reason);
        }
    };

    const resetCallbackRegistrations = async (args: { token_hash?: string; wait?: boolean }) => {
        const targetTokens = args.token_hash
            ? tokenEntries(config).filter((entry) => entry.tokenHash === args.token_hash)
            : tokenEntries(config);

        if (args.token_hash && targetTokens.length === 0) {
            throw new Error(`Unknown MrKwiz MCP token hash: ${args.token_hash}`);
        }

        for (const entry of targetTokens) {
            registeredCallbackUrls.delete(entry.tokenHash);
        }

        if (args.wait) {
            await Promise.all(targetTokens.map((entry) => ensureCallbackRegistered(entry, 'manual-reset')));
        } else {
            for (const entry of targetTokens) {
                scheduleCallbackRegistration(entry, 'manual-reset');
            }
        }

        return {
            ok: true,
            mode: args.wait ? 'completed' : 'scheduled',
            tokens: targetTokens.map((entry) => ({
                callback_url: tokenCallbackUrl(entry.tokenHash),
                token_hash: entry.tokenHash,
            })),
        };
    };

    const upsertToken = async (input: { baseUrl?: string; label?: string; token: string }) => {
        const token = input.token.trim();
        if (!token) throw new Error('MCP token is required.');
        const tokenHash = hashToken(token);
        const now = new Date().toISOString();
        const next: StoredToken = {
            baseUrl: normalizeBaseUrl(input.baseUrl),
            createdAt: config.tokens[tokenHash]?.createdAt ?? now,
            label: input.label,
            mcpName: config.tokens[tokenHash]?.mcpName ?? mcpNameForTokenHash(tokenHash),
            pendingRequest: config.tokens[tokenHash]?.pendingRequest ?? null,
            quiz: config.tokens[tokenHash]?.quiz,
            session: config.tokens[tokenHash]?.session,
            token,
            tokenHash,
            updatedAt: now,
        };
        config.tokens = { ...config.tokens, [tokenHash]: next };
        await saveConfig();
        scheduleCallbackRegistration(next, 'configure-token');
        return next;
    };

    const ensureMcpReady = async (entry: StoredToken, reason: string) => {
        const current = await getOpenCodeMcpStatus(entry.mcpName);
        if (current.status === 'connected') return { changed: false, name: entry.mcpName, status: current.status };

        await client.tui.showToast({
            body: {
                message: `Setting up MrKwiz MCP ${entry.mcpName}...`,
                variant: 'info',
            },
        }).catch(() => {});
        const addResult = await client.mcp.add({
            body: {
                config: {
                    enabled: true,
                    headers: { Authorization: `Bearer ${entry.token}` },
                    oauth: false,
                    type: 'remote',
                    url: `${entry.baseUrl}/mcp`,
                },
                name: entry.mcpName,
            },
            query: { directory },
        });
        const connectResult = await client.mcp.connect({ path: { name: entry.mcpName }, query: { directory } });
        await client.tui.showToast({
            body: {
                message: `MrKwiz MCP ready: ${entry.mcpName}`,
                variant: 'success',
            },
        }).catch(() => {});
        await debug('MCP token server ready.', { add_result: addResult.data, connect_result: connectResult.data, directory, mcp_name: entry.mcpName, previous_status: current, reason, token_hash: entry.tokenHash });
        return { addResult: addResult.data, changed: true, connectResult: connectResult.data, name: entry.mcpName };
    };

    const runDiagnostics = async (entry: StoredToken, request: BridgeRequest): Promise<DiagnosticReport> => {
        const checks: DiagnosticCheck[] = [];
        const addCheck = (check: DiagnosticCheck) => checks.push(check);

        addCheck({
            details: { action: request.action, base_url: entry.baseUrl, callback_url: tokenCallbackUrl(entry.tokenHash) },
            message: 'Local token and callback URL are available.',
            ok: true,
        });

        let activated = false;
        try {
            const activation = await ensureMcpReady(entry, request.action);
            activated = true;
            addCheck({
                details: { changed: activation.changed, mcp_name: entry.mcpName },
                message: 'OpenCode MCP server setup succeeded.',
                ok: true,
            });
        } catch (error) {
            await client.tui.showToast({
                body: {
                    message: `MrKwiz MCP setup failed for ${entry.label ?? entry.tokenHash}.`,
                    variant: 'error',
                },
            }).catch(() => {});
            addCheck({
                details: { error: error instanceof Error ? error.message : String(error) },
                message: 'OpenCode MCP server setup failed.',
                ok: false,
            });
        }

        const mcpStatus = await getOpenCodeMcpStatus(entry.mcpName);
        addCheck({
            details: mcpStatus,
            message: mcpStatus.status ? 'OpenCode reports this MrKwiz MCP server.' : 'OpenCode does not report this MrKwiz MCP server.',
            ok: !!mcpStatus.status,
        });

        if (activated) {
            try {
                const context = await callMcpTool(entry, 'get_quiz_context', {});
                addCheck({
                    details: { context_preview: context.slice(0, 500) },
                    message: 'Hosted MrKwiz MCP get_quiz_context succeeded.',
                    ok: true,
                });
            } catch (error) {
                addCheck({
                    details: { error: error instanceof Error ? error.message : String(error) },
                    message: 'Hosted MrKwiz MCP get_quiz_context failed.',
                    ok: false,
                });
            }
        }

        return { checks, ok: checks.every((check) => check.ok), token_hash: entry.tokenHash };
    };

    const promptSession = async (sessionId: string, prompt: string, model: ModelConfig | undefined) => {
        await client.session.promptAsync({
            body: {
                model,
                parts: [{ text: prompt, type: 'text' }],
            },
            path: { id: sessionId },
            query: { directory },
        });
    };

    const createSessionForPrompt = async (entry: StoredToken, prompt: string, payload: BridgePayload, model: ModelConfig | undefined) => {
        const session = await client.session.create({
            body: { title: titleForAction(payload) },
            query: { directory },
        });
        if (!session.data?.id) {
            await debug('OpenCode session.create did not return a session id.', { response: session.response, data: session.data });
            throw new Error('OpenCode did not return a session id.');
        }

        await promptSession(session.data.id, prompt, model);

        await debug('Created MrKwiz OpenCode session.', { mcp_name: entry.mcpName, session_id: session.data.id, title: titleForAction(payload), token_hash: entry.tokenHash });
        return session.data;
    };

    const tokenForSession = (sessionId: string): StoredToken | undefined => tokenEntries(config).find((entry) => entry.session?.id === sessionId);

    const storedSessionIsVisible = async (entry: StoredToken): Promise<boolean> => {
        if (!entry.session?.id) return false;
        const sessions = await client.session.list({ query: { directory } });
        return !!sessions.data?.some((session) => session.id === entry.session!.id);
    };

    const sendPrompt = async (entry: StoredToken, prompt: string, payload: BridgePayload, options: { ensureMcp?: boolean } = {}) => {
        if (options.ensureMcp !== false) await ensureMcpReady(entry, payload.action ?? 'open_quiz');
        const model = config.defaultModel ? { modelID: config.defaultModel.modelID, providerID: config.defaultModel.providerID } : undefined;
        const quizId = payload.quiz_id?.trim();

        if (entry.session && await storedSessionIsVisible(entry)) {
            try {
                await promptSession(entry.session.id, prompt, model);
                const now = new Date().toISOString();
                entry.quiz = { id: quizId ?? entry.quiz?.id, title: payload.quiz_title ?? entry.quiz?.title };
                entry.session = {
                    ...entry.session,
                    lastAction: payload.action,
                    quizId: quizId ?? entry.session.quizId,
                    quizTitle: payload.quiz_title ?? entry.session.quizTitle,
                    updatedAt: now,
                };
                entry.updatedAt = now;
                config.tokens[entry.tokenHash] = entry;
                await saveConfig();
                await debug('Reused MrKwiz OpenCode session.', { mcp_name: entry.mcpName, quiz_id: quizId, session_id: entry.session.id, title: titleForAction(payload), token_hash: entry.tokenHash });
                return { id: entry.session.id };
            } catch (error) {
                await debug('Stored MrKwiz OpenCode session could not be reused; creating replacement.', {
                    error: error instanceof Error ? error.message : String(error),
                    mcp_name: entry.mcpName,
                    quiz_id: quizId,
                    session_id: entry.session.id,
                    token_hash: entry.tokenHash,
                });
                delete entry.session;
                config.tokens[entry.tokenHash] = entry;
                await saveConfig();
            }
        }

        const session = await createSessionForPrompt(entry, prompt, payload, model);
        const now = new Date().toISOString();
        entry.quiz = { id: quizId ?? entry.quiz?.id, title: payload.quiz_title ?? entry.quiz?.title };
        entry.session = {
            createdAt: now,
            id: session.id,
            lastAction: payload.action,
            quizId: quizId ?? entry.quiz?.id,
            quizTitle: payload.quiz_title ?? entry.quiz?.title,
            updatedAt: now,
        };
        entry.updatedAt = now;
        config.tokens[entry.tokenHash] = entry;
        await saveConfig();
        await debug('Tracked MrKwiz OpenCode session for token.', { mcp_name: entry.mcpName, quiz_id: quizId, session_id: session.id, title: titleForAction(payload), token_hash: entry.tokenHash });
        return session;
    };

    const storePendingRequest = async (request: BridgeRequest, diagnosticReport: DiagnosticReport): Promise<PendingBridgeRequest> => {
        const pending: PendingBridgeRequest = {
            ...request,
            createdAt: new Date().toISOString(),
            diagnosticReport,
        };
        const entry = config.tokens[request.tokenHash];
        if (entry) {
            entry.pendingRequest = pending;
            entry.updatedAt = new Date().toISOString();
            config.tokens[request.tokenHash] = entry;
        }
        await saveConfig();
        return pending;
    };

    const clearPendingRequest = async (entry: StoredToken) => {
        if (!entry.pendingRequest) return;
        entry.pendingRequest = null;
        entry.updatedAt = new Date().toISOString();
        config.tokens[entry.tokenHash] = entry;
        await saveConfig();
    };

    const handleBridgeRequest = async (request: BridgeRequest) => {
        const entry = config.tokens[request.tokenHash];
        if (!entry) throw new Error(`Unknown MrKwiz MCP token hash: ${request.tokenHash}`);

        scheduleCallbackRegistration(entry, request.action);
        const diagnostics = await runDiagnostics(entry, request);

        if (diagnostics.ok) {
            const prompt = buildDesignPrompt(request, diagnostics);
            const session = await sendPrompt(entry, prompt, request.payload);
            await clearPendingRequest(entry);
            return { diagnostics, pending_request: null, session };
        }

        const pending = await storePendingRequest(request, diagnostics);
        const prompt = buildSetupPrompt(pending, diagnostics);
        const session = await sendPrompt(entry, prompt, request.payload, { ensureMcp: false });
        return { diagnostics, pending_request: pending, session };
    };

    const doPendingRequest = async (args: { clear?: boolean }) => {
        const pendingEntry = tokenEntries(config).find((entry) => entry.pendingRequest);
        const pending = pendingEntry?.pendingRequest ?? null;
        if (!pending) {
            return { ok: false, note: 'No pending MrKwiz user request is stored.' };
        }

        if (args.clear) {
            await clearPendingRequest(pendingEntry!);
            return { ok: true, cleared: true };
        }

        const result = await handleBridgeRequest(pending);
        return {
            diagnostics: result.diagnostics,
            ok: result.diagnostics.ok,
            pending_request: result.pending_request
                ? { action: result.pending_request.action, created_at: result.pending_request.createdAt, token_hash: result.pending_request.tokenHash }
                : null,
            session_id: result.session.id,
        };
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
        const entry = config.tokens[tokenHash];
        if (!entry) return addCors(request, json({ error: 'Unknown MrKwiz MCP token hash.' }, { status: 404 }));

        if (request.method === 'GET' && suffix === 'status') {
            scheduleCallbackRegistration(entry, 'token-status');
            return addCors(request, json(await publicTokenStatus(entry)));
        }
        if (request.method !== 'POST') return addCors(request, json({ error: 'Method not allowed.' }, { status: 405 }));

        const actionByPath: Record<string, BridgeAction> = {
            'edit-archetypes': 'edit_archetypes',
            'edit-intro': 'edit_intro',
            'edit-question': 'edit_question',
            'edit-scoring': 'edit_scoring',
            'edit-theme': 'edit_theme',
            'open-quiz': 'open_quiz',
        };
        const action = actionByPath[suffix];
        if (!action) return addCors(request, json({ error: 'Unknown MrKwiz bridge action.' }, { status: 404 }));

        const payload = { ...((await request.json().catch(() => ({}))) as BridgePayload), action };
        const result = await handleBridgeRequest({ action, payload, tokenHash });
        await client.tui.showToast({
            body: {
                message: result.diagnostics.ok
                    ? 'MrKwiz diagnostics passed and prompt sent to OpenCode.'
                    : 'MrKwiz diagnostics failed; setup prompt sent to OpenCode.',
                variant: 'success',
            },
        });
        return addCors(request, json({ diagnostics: result.diagnostics, mcp_name: entry.mcpName, ok: true, session_id: result.session.id, token_hash: entry.tokenHash }));
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
        token_count: tokenEntries(config).length,
    });
    refreshCallbackRegistrations('startup');

    const configureToken = async (args: { base_url?: string; label?: string; token: string }) => {
        await debug('mrkwiz_configure_mcp invoked.', { base_url: args.base_url, token_length: args.token?.length ?? 0 });
        const entry = await upsertToken({ baseUrl: args.base_url, label: args.label, token: args.token });
        return {
            ok: true,
            callback_url: tokenCallbackUrl(entry.tokenHash),
            config_file: configFile,
            mcp_name: entry.mcpName,
            note: 'Token saved locally. Callback registration is running in the background; MrKwiz will connect this token-specific MCP server when a bridge action uses this token.',
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

    const currentSystemPrompt = (sessionID: string) => {
        const captured = getCapturedSystemPrompt(capturedSystemPrompts, sessionID);
        if (!captured) {
            return {
                known_sessions: [...capturedSystemPrompts.keys()],
                note: 'No system prompt has been captured for this session yet. It is captured when OpenCode prepares a model request.',
                ok: false,
                session_id: sessionID,
            };
        }

        return {
            captured_at: captured.capturedAt,
            joined_system: captured.system.join('\n\n'),
            mcp_name: captured.mcpName ?? null,
            ok: true,
            session_id: captured.sessionID,
            system: captured.system,
            token_hash: captured.tokenHash ?? null,
        };
    };

    const currentToolSnapshot = (args: { include_parameters?: boolean; prefix?: string }) => {
        const tools = getCapturedToolDefinitions(capturedToolDefinitions, { includeParameters: args.include_parameters, prefix: args.prefix });
        return {
            captured_tool_count: capturedToolDefinitions.size,
            include_parameters: args.include_parameters === true,
            ok: true,
            prefix: args.prefix?.trim() || null,
            tools,
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
                description: 'Discover the local MrKwiz OpenCode bridge status, configured default model, token hashes, callback URLs, MCP names, and token-owned sessions.',
                async execute() {
                    const currentStatus = await status();
                    await debug('mrkwiz_bridge_status invoked.', currentStatus);
                    return JSON.stringify(currentStatus, null, 2);
                },
            }),
            mrkwiz_reset_callback_urls: tool({
                args: {
                    token_hash: tool.schema.string().optional().describe('Optional token hash to reset. If omitted, all saved MrKwiz token callbacks are re-registered.'),
                    wait: tool.schema.boolean().optional().describe('If true, wait for registration attempts to finish. Defaults to false and runs in the background.'),
                },
                description: 'Force re-register MrKwiz OpenCode callback URLs for saved MCP tokens. Use when the MrKwiz admin page has stale or missing OpenCode callback URLs.',
                async execute(args) {
                    return JSON.stringify(await resetCallbackRegistrations(args), null, 2);
                },
            }),
            mrkwiz_do_pending_request: tool({
                args: {
                    clear: tool.schema.boolean().optional().describe('If true, abandon the stored pending MrKwiz user request instead of retrying it.'),
                },
                description: 'Retry the stored pending MrKwiz admin UI request after setup diagnostics have been resolved, or clear it if stale.',
                async execute(args) {
                    return JSON.stringify(await doPendingRequest(args), null, 2);
                },
            }),
            mrkwiz_get_system_prompt: tool({
                args: {
                    session_id: tool.schema.string().optional().describe('Optional OpenCode session id. Defaults to the current tool-calling session.'),
                },
                description: 'Return the most recent OpenCode system prompt captured by the MrKwiz plugin for the current session. Debugging tool for prompt/MCP injection issues.',
                async execute(args, context) {
                    const sessionID = args.session_id?.trim() || context.sessionID;
                    return JSON.stringify(currentSystemPrompt(sessionID), null, 2);
                },
            }),
            mrkwiz_get_tool_snapshot: tool({
                args: {
                    include_parameters: tool.schema.boolean().optional().describe('If true, include captured tool parameter schemas. Defaults to false.'),
                    prefix: tool.schema.string().optional().describe('Optional tool ID prefix filter, for example mrkwiz_ee883bb218ce.'),
                },
                description: 'Return the most recent OpenCode tool definitions observed by the MrKwiz plugin. Debugging tool for MCP/tool-map exposure issues.',
                async execute(args) {
                    return JSON.stringify(currentToolSnapshot(args), null, 2);
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
        async "experimental.chat.system.transform"(input, output) {
            if (!input.sessionID) return;
            const entry = tokenForSession(input.sessionID);
            if (entry) {
                try {
                    await ensureMcpReady(entry, 'chat-system-transform');
                } catch (error) {
                    await debug('Failed to prepare token MCP during system transform.', {
                        error: error instanceof Error ? error.message : String(error),
                        mcp_name: entry.mcpName,
                        session_id: input.sessionID,
                        token_hash: entry.tokenHash,
                    });
                }
                injectMcpSystemPrompt(output.system, entry);
            }
            captureSystemPrompt(capturedSystemPrompts, {
                capturedAt: new Date().toISOString(),
                mcpName: entry?.mcpName,
                sessionID: input.sessionID,
                system: output.system,
                tokenHash: entry?.tokenHash,
            });
        },
        async "tool.definition"(input, output) {
            captureToolDefinition(capturedToolDefinitions, {
                capturedAt: new Date().toISOString(),
                description: output.description,
                parameters: output.parameters,
                toolID: input.toolID,
            });
        },
    };
};

export default MrKwizOpenCodePlugin;
