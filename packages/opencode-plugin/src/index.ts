import { type Plugin, tool } from '@opencode-ai/plugin';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { captureSystemPrompt, captureToolDefinition, getCapturedSystemPrompt, getCapturedToolDefinitions, injectMcpSystemPrompt } from './prompt.ts';
import type { CapturedSystemPrompt, CapturedToolDefinition, MrKwizMcpToolName } from './prompt.ts';

export { buildMcpSystemPrompt, captureSystemPrompt, captureToolDefinition, getCapturedSystemPrompt, getCapturedToolDefinitions, injectMcpSystemPrompt, mcpToolId, mcpToolReference, upsertMcpSystemPrompt } from './prompt.ts';
export type { CapturedSystemPrompt, CapturedToolDefinition, MrKwizMcpToolName } from './prompt.ts';

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
    mcp_activation?: McpActivation;
    ok: boolean;
    token_hash: string;
};

type McpActivation = {
    changed: boolean;
    configured_this_prompt: boolean;
    instance_state_key: string;
    mcp_name: string;
    plugin_directory: string;
    reason: string;
    status_after: string | null;
    status_before: string | null;
    target_directory: string;
    tool_prefix: string;
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
        directory?: string;
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

type StoredQuizWorkspace = {
    baseUrl: string;
    createdAt: string;
    quizId: string;
    quizTitle: string;
    tokenHash: string;
    tokenHashes: string[];
    updatedAt: string;
    workspaceDirectory: string;
    workspaceId: string;
};

type ModelConfig = {
    modelID: string;
    providerID: string;
};

type MrKwizConfig = {
    defaultModel: ModelConfig | null;
    quizWorkspaces: Record<string, StoredQuizWorkspace>;
    tokens: Record<string, StoredToken>;
    version: 2 | 3;
};

type JsonRpcResponse = {
    error?: unknown;
    result?: unknown;
};

type OpenCodeWorkspaceClient = {
    create(parameters: { branch?: string | null; directory?: string; extra?: unknown | null; id?: string; type?: string }): Promise<{ data?: unknown }>;
    syncList(parameters?: { directory?: string; workspace?: string }): Promise<{ data?: unknown }>;
    warp(parameters?: { copyChanges?: boolean; directory?: string; id?: string | null; sessionID?: string; workspace?: string }): Promise<{ data?: unknown }>;
};

const emptyConfig = (): MrKwizConfig => ({ defaultModel: null, quizWorkspaces: {}, tokens: {}, version: 3 });

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

const dataHome = (): string => process.env.XDG_DATA_HOME?.trim() || path.join(homedir(), '.local', 'share');

const mrkwizDataDir = (): string => path.join(dataHome(), 'mrkwiz');

const quizWorkspaceRoot = (): string => path.join(mrkwizDataDir(), 'opencode-workspaces');

const safePathSegment = (value: string): string => value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'quiz';

const workspaceIdForQuiz = (quizId: string): string => `mrkwiz_${hashToken(quizId).slice(0, 16)}`;

const workspaceDirectoryForQuiz = (quizId: string): string => path.join(quizWorkspaceRoot(), safePathSegment(quizId));

const sameDirectory = (left: string, right: string): boolean => path.resolve(left) === path.resolve(right);

const uniqueStrings = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

const pluginPath = (): string => fileURLToPath(import.meta.url);

const skillsUrlForBaseUrl = (baseUrl: string): string => `${baseUrl.replace(/\/$/, '')}/.well-known/skills/`;

const isLocalBaseUrl = (value: string): boolean => {
    try {
        const hostname = new URL(normalizeBaseUrl(value)).hostname.toLowerCase();
        return hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '::1' || hostname === '[::1]' || hostname.startsWith('127.');
    } catch {
        return false;
    }
};

const stripJsoncComments = (value: string): string => {
    let output = '';
    let inString = false;
    let escaped = false;

    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        const next = value[index + 1];

        if (inString) {
            output += character;
            if (escaped) {
                escaped = false;
            } else if (character === '\\') {
                escaped = true;
            } else if (character === '"') {
                inString = false;
            }
            continue;
        }

        if (character === '"') {
            inString = true;
            output += character;
            continue;
        }

        if (character === '/' && next === '/') {
            while (index < value.length && value[index] !== '\n') index += 1;
            output += '\n';
            continue;
        }

        if (character === '/' && next === '*') {
            index += 2;
            while (index < value.length && !(value[index] === '*' && value[index + 1] === '/')) index += 1;
            index += 1;
            continue;
        }

        output += character;
    }

    return output;
};

const stripJsonTrailingCommas = (value: string): string => {
    let output = '';
    let inString = false;
    let escaped = false;

    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];

        if (inString) {
            output += character;
            if (escaped) {
                escaped = false;
            } else if (character === '\\') {
                escaped = true;
            } else if (character === '"') {
                inString = false;
            }
            continue;
        }

        if (character === '"') {
            inString = true;
            output += character;
            continue;
        }

        if (character === ',') {
            let nextIndex = index + 1;
            while (/\s/.test(value[nextIndex] ?? '')) nextIndex += 1;
            if (value[nextIndex] === '}' || value[nextIndex] === ']') continue;
        }

        output += character;
    }

    return output;
};

const parseJsoncObject = (value: string): Record<string, unknown> | null => {
    const parsed = JSON.parse(stripJsonTrailingCommas(stripJsoncComments(value))) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
};

const userOpenCodeConfigFiles = (): string[] => [
    path.join(homedir(), '.config', 'opencode', 'opencode.jsonc'),
    path.join(homedir(), '.config', 'opencode', 'opencode.json'),
];

const isMrKwizPluginEntry = (value: string): boolean => {
    const normalized = value.replace(/\\/g, '/');
    return value === '@mrkwiz/opencode-plugin'
        || normalized.endsWith('packages/opencode-plugin/src/index.ts')
        || normalized.includes('/node_modules/@mrkwiz/opencode-plugin/');
};

const mrkwizPluginEntryFromConfig = (config: Record<string, unknown>): string | null => {
    const plugins = config.plugin;
    if (!Array.isArray(plugins)) return null;
    const entry = plugins.find((plugin) => typeof plugin === 'string' && isMrKwizPluginEntry(plugin));
    return typeof entry === 'string' ? entry : null;
};

const userConfiguredMrKwizPluginEntry = async (): Promise<string | null> => {
    for (const file of userOpenCodeConfigFiles()) {
        try {
            if (!existsSync(file)) continue;
            const parsed = parseJsoncObject(await readFile(file, 'utf8'));
            const entry = parsed ? mrkwizPluginEntryFromConfig(parsed) : null;
            if (entry) return entry;
        } catch {
            // Invalid user config should not block workspace creation; fall back below.
        }
    }

    return null;
};

const localCheckoutPluginEntry = (directory: string): string | null => {
    const candidates = [
        path.join(directory, 'packages', 'opencode-plugin', 'src', 'index.ts'),
        pluginPath(),
    ];

    for (const candidate of candidates) {
        const normalized = candidate.replace(/\\/g, '/');
        if (!normalized.includes('/node_modules/') && normalized.endsWith('/packages/opencode-plugin/src/index.ts') && existsSync(candidate)) return candidate;
    }

    return null;
};

const parseQuizWorkspaces = (value: unknown): Record<string, StoredQuizWorkspace> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const now = new Date().toISOString();
    const workspaces: Record<string, StoredQuizWorkspace> = {};

    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const input = raw as Partial<StoredQuizWorkspace>;
        const quizId = typeof input.quizId === 'string' && input.quizId ? input.quizId : key;
        const parsedTokenHashes = Array.isArray(input.tokenHashes) ? input.tokenHashes.filter((item): item is string => typeof item === 'string' && !!item) : [];
        const tokenHash = typeof input.tokenHash === 'string' && input.tokenHash ? input.tokenHash : (parsedTokenHashes[0] ?? '');
        const tokenHashes = uniqueStrings([tokenHash, ...parsedTokenHashes]);
        if (!quizId || !tokenHash) continue;
        workspaces[quizId] = {
            baseUrl: normalizeBaseUrl(input.baseUrl),
            createdAt: typeof input.createdAt === 'string' && input.createdAt ? input.createdAt : now,
            quizId,
            quizTitle: typeof input.quizTitle === 'string' && input.quizTitle ? input.quizTitle : 'MrKwiz quiz',
            tokenHash,
            tokenHashes,
            updatedAt: typeof input.updatedAt === 'string' && input.updatedAt ? input.updatedAt : now,
            workspaceDirectory: typeof input.workspaceDirectory === 'string' && input.workspaceDirectory ? input.workspaceDirectory : workspaceDirectoryForQuiz(quizId),
            workspaceId: typeof input.workspaceId === 'string' && input.workspaceId ? input.workspaceId : workspaceIdForQuiz(quizId),
        };
    }

    return workspaces;
};

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

export const MrKwizOpenCodePlugin: Plugin = async ({ client, directory, experimental_workspace }) => {
    const opencodeDir = path.join(mrkwizDataDir(), 'opencode-plugin');
    const configFile = path.join(opencodeDir, 'mrkwiz.json');
    const legacyOpencodeDir = path.join(process.cwd(), '.opencode');
    const legacyConfigFile = path.join(legacyOpencodeDir, 'mrkwiz.json');
    const legacyTokenFile = path.join(legacyOpencodeDir, 'mrkwiz-mcp-token');
    const logFile = path.join(mrkwizDataDir(), 'mrkwiz-plugin.log');
    let config = emptyConfig();
    let server: Server | null = null;
    let serverPort = 0;
    const callbackRegistrations = new Map<string, Promise<void>>();
    const capturedSystemPrompts = new Map<string, CapturedSystemPrompt>();
    const capturedToolDefinitions = new Map<string, CapturedToolDefinition>();
    const registeredCallbackUrls = new Map<string, string>();
    const debugStdout = process.env.MRKWIZ_PLUGIN_DEBUG_STDOUT === '1';

    const redact = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(redact);
        if (!value || typeof value !== 'object') return typeof value === 'string' && value.startsWith('Bearer ') ? 'Bearer [redacted]' : value;
        const output: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            const lower = key.toLowerCase();
            output[key] = lower === 'token' || lower === 'authorization' || lower === 'headers'
                ? '[redacted]'
                : redact(item);
        }
        return output;
    };

    const debug = async (message: string, extra?: Record<string, unknown>) => {
        const redactedExtra = redact(extra ?? {}) as Record<string, unknown>;
        if (debugStdout) console.info(`[mrkwiz-opencode-plugin] ${message}`, redactedExtra);
        mkdirSync(opencodeDir, { recursive: true });
        await appendFile(logFile, `${JSON.stringify({ at: new Date().toISOString(), extra: redactedExtra, level: 'info', message })}\n`, 'utf8').catch(() => {});
        await client.app
            .log({ body: { service: 'mrkwiz-opencode-plugin', level: 'info', message, extra: redactedExtra } })
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
                          directory: typeof entry.session.directory === 'string' && entry.session.directory ? entry.session.directory : undefined,
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

        const sourceConfigFile = existsSync(configFile) ? configFile : legacyConfigFile;

        if (!existsSync(sourceConfigFile)) {
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
                quizWorkspaces: {},
                tokens: { [tokenHash]: entry },
                version: 3,
            };
        }

        const parsed = JSON.parse(await readFile(sourceConfigFile, 'utf8')) as Partial<MrKwizConfig> & {
            activeTokenHash?: unknown;
            pendingRequest?: unknown;
            quizSessions?: unknown;
            quizWorkspaces?: unknown;
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
            quizWorkspaces: parseQuizWorkspaces(parsed.quizWorkspaces),
            tokens: tokensByHash(parsedTokens),
            version: 3,
        };
    };

    const saveConfig = async () => {
        mkdirSync(path.dirname(configFile), { recursive: true });
        await writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    };

    const tokenCallbackUrl = (tokenHash: string) => `http://127.0.0.1:${serverPort}/mrkwiz/${nonce}/tokens/${tokenHash}`;

    const currentQuizWorkspace = (): StoredQuizWorkspace | undefined => Object.values(config.quizWorkspaces).find((workspace) => sameDirectory(workspace.workspaceDirectory, directory));

    const workspaceTokenHashes = (workspace: StoredQuizWorkspace): string[] => uniqueStrings([workspace.tokenHash, ...workspace.tokenHashes]);

    const workspaceHasToken = (workspace: StoredQuizWorkspace, tokenHash: string): boolean => workspaceTokenHashes(workspace).includes(tokenHash);

    const quizWorkspacesForToken = (tokenHash: string): StoredQuizWorkspace[] => Object.values(config.quizWorkspaces).filter((workspace) => workspaceHasToken(workspace, tokenHash));

    const tokenEntriesForWorkspace = (workspace: StoredQuizWorkspace): StoredToken[] => {
        const hashes = new Set(workspaceTokenHashes(workspace));
        return tokenEntries(config).filter((entry) => hashes.has(entry.tokenHash) || entry.quiz?.id === workspace.quizId);
    };

    const ownsToken = (tokenHash: string): boolean => {
        const workspaces = quizWorkspacesForToken(tokenHash);
        if (workspaces.length === 0) return true;
        const current = currentQuizWorkspace();
        return !!current && workspaceHasToken(current, tokenHash);
    };

    const ownedTokenEntries = (): StoredToken[] => tokenEntries(config).filter((entry) => ownsToken(entry.tokenHash));

    const targetDirectoryForEntry = (entry: StoredToken): string => {
        const ownedWorkspace = currentQuizWorkspace();
        if (ownedWorkspace && workspaceHasToken(ownedWorkspace, entry.tokenHash)) return ownedWorkspace.workspaceDirectory;
        return entry.session?.directory || quizWorkspacesForToken(entry.tokenHash)[0]?.workspaceDirectory || directory;
    };

    const getOpenCodeMcpStatus = async (name?: string, targetDirectory = directory): Promise<{ name: string | null; status: string | null }> => {
        try {
            const result = await client.mcp.status({ query: { directory: targetDirectory } });
            const servers = (result.data as Record<string, { status?: string }> | undefined) ?? {};
            const mcpName = name ?? ['mrkwiz', 'mrkwiz-debug'].find((candidate) => typeof servers[candidate]?.status === 'string') ?? null;
            return { name: mcpName, status: mcpName ? (servers[mcpName]?.status ?? null) : null };
        } catch (error) {
            await debug('Failed to read OpenCode MCP status.', { error: error instanceof Error ? error.message : String(error), target_directory: targetDirectory });
            return { name: null, status: null };
        }
    };

    const publicTokenStatus = async (entry: StoredToken) => {
        const targetDirectory = targetDirectoryForEntry(entry);
        const mcp = await getOpenCodeMcpStatus(entry.mcpName, targetDirectory);
        return {
            base_url: entry.baseUrl,
            callback_url: tokenCallbackUrl(entry.tokenHash),
            connected: ownsToken(entry.tokenHash) && mcp.status === 'connected',
            label: entry.label ?? null,
            mcp_name: entry.mcpName,
            mcp_status: mcp.status,
            owned_by_this_instance: ownsToken(entry.tokenHash),
            pending_request: entry.pendingRequest
                ? {
                      action: entry.pendingRequest.action,
                      created_at: entry.pendingRequest.createdAt,
                      token_hash: entry.pendingRequest.tokenHash,
                  }
                : null,
            session: entry.session
                ? {
                      directory: entry.session.directory ?? null,
                      id: entry.session.id,
                      quiz_id: entry.session.quizId ?? entry.quiz?.id ?? null,
                      quiz_title: entry.session.quizTitle ?? entry.quiz?.title ?? null,
                      updated_at: entry.session.updatedAt,
                  }
                : null,
            target_directory: targetDirectory,
            token_hash: entry.tokenHash,
            workspaces: quizWorkspacesForToken(entry.tokenHash).map((workspace) => ({
                current_instance: sameDirectory(workspace.workspaceDirectory, directory),
                quiz_id: workspace.quizId,
                quiz_title: workspace.quizTitle,
                token_hashes: workspaceTokenHashes(workspace),
                workspace_directory: workspace.workspaceDirectory,
                workspace_id: workspace.workspaceId,
            })),
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
            log_file: logFile,
            quiz_workspace: currentQuizWorkspace()
                ? {
                      quiz_id: currentQuizWorkspace()!.quizId,
                      quiz_title: currentQuizWorkspace()!.quizTitle,
                      workspace_directory: currentQuizWorkspace()!.workspaceDirectory,
                      workspace_id: currentQuizWorkspace()!.workspaceId,
                  }
                : null,
            quiz_workspaces: Object.values(config.quizWorkspaces).map((workspace) => ({
                current_instance: sameDirectory(workspace.workspaceDirectory, directory),
                quiz_id: workspace.quizId,
                quiz_title: workspace.quizTitle,
                token_hash: workspace.tokenHash,
                token_hashes: workspaceTokenHashes(workspace),
                workspace_directory: workspace.workspaceDirectory,
                workspace_id: workspace.workspaceId,
            })),
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
        if (!ownsToken(entry.tokenHash)) {
            await debug('Skipping callback registration for token not owned by this plugin instance.', {
                current_directory: directory,
                reason,
                token_hash: entry.tokenHash,
                workspace_directories: quizWorkspacesForToken(entry.tokenHash).map((workspace) => workspace.workspaceDirectory),
            });
            return;
        }
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
        for (const entry of ownedTokenEntries()) {
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
            await Promise.all(targetTokens.filter((entry) => ownsToken(entry.tokenHash)).map((entry) => ensureCallbackRegistered(entry, 'manual-reset')));
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

    const upsertToken = async (input: { baseUrl?: string; label?: string; token: string }, options: { scheduleCallback?: boolean } = {}) => {
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
        if (options.scheduleCallback !== false) scheduleCallbackRegistration(next, 'configure-token');
        return next;
    };

    const materializeQuizWorkspace = async (workspace: StoredQuizWorkspace) => {
        const workspaceOpencodeDir = path.join(workspace.workspaceDirectory, '.opencode');
        const tokenDirectory = path.join(workspaceOpencodeDir, 'mrkwiz-tokens');
        const pluginEntry = await userConfiguredMrKwizPluginEntry()
            ?? (isLocalBaseUrl(workspace.baseUrl) ? localCheckoutPluginEntry(directory) : null)
            ?? pluginPath();
        mkdirSync(workspaceOpencodeDir, { recursive: true });
        mkdirSync(tokenDirectory, { recursive: true });

        const workspaceTokens = tokenEntriesForWorkspace(workspace);
        for (const entry of workspaceTokens) {
            await writeFile(path.join(tokenDirectory, entry.tokenHash), `${entry.token}\n`, 'utf8');
        }

        const mcp = Object.fromEntries(workspaceTokens.map((entry) => [
            entry.mcpName,
            {
                enabled: true,
                headers: { Authorization: `Bearer {file:${path.join(tokenDirectory, entry.tokenHash)}}` },
                type: 'remote',
                url: `${entry.baseUrl}/mcp`,
            },
        ]));

        await writeFile(
            path.join(workspace.workspaceDirectory, 'opencode.json'),
            `${JSON.stringify(
                {
                    $schema: 'https://opencode.ai/config.json',
                    mcp,
                    plugin: [pluginEntry],
                    skills: { urls: [skillsUrlForBaseUrl(workspace.baseUrl)] },
                },
                null,
                2
            )}\n`,
            'utf8'
        );

        await writeFile(
            path.join(workspaceOpencodeDir, 'mrkwiz.json'),
            `${JSON.stringify(
                {
                    centralConfigFile: configFile,
                    quizWorkspace: {
                        baseUrl: workspace.baseUrl,
                        quizId: workspace.quizId,
                        quizTitle: workspace.quizTitle,
                        tokenHash: workspace.tokenHash,
                        tokenHashes: workspaceTokenHashes(workspace),
                        workspaceId: workspace.workspaceId,
                    },
                    version: 3,
                },
                null,
                2
            )}\n`,
            'utf8'
        );

        await debug('Materialized MrKwiz quiz workspace.', {
            quiz_id: workspace.quizId,
            token_hash: workspace.tokenHash,
            token_hashes: workspaceTokenHashes(workspace),
            mcp_names: workspaceTokens.map((entry) => entry.mcpName),
            plugin: pluginEntry,
            workspace_directory: workspace.workspaceDirectory,
            workspace_id: workspace.workspaceId,
        });

        await writeFile(
            path.join(workspaceOpencodeDir, '.gitignore'),
            ['node_modules', 'package.json', 'package-lock.json', 'bun.lock', 'mrkwiz.json', 'mrkwiz-mcp-token', 'mrkwiz-tokens', '.gitignore', ''].join('\n'),
            'utf8'
        );

        return { pluginEntry };
    };

    const workspaceForInfo = (info: { extra?: unknown | null; id?: string }): StoredQuizWorkspace | undefined => {
        const extra = info.extra && typeof info.extra === 'object' && !Array.isArray(info.extra) ? info.extra as { quizId?: unknown } : null;
        const quizId = typeof extra?.quizId === 'string' && extra.quizId ? extra.quizId : undefined;
        return Object.values(config.quizWorkspaces).find((workspace) => workspace.workspaceId === info.id || workspace.quizId === quizId);
    };

    experimental_workspace.register('mrkwiz-quiz', {
        name: 'MrKwiz quiz',
        description: 'Machine-local MrKwiz quiz workspaces managed by the MrKwiz OpenCode plugin.',
        async configure(info) {
            const workspace = workspaceForInfo(info);
            if (!workspace) return info;
            return {
                ...info,
                branch: null,
                directory: workspace.workspaceDirectory,
                name: workspace.quizTitle,
            };
        },
        async create(info) {
            const workspace = workspaceForInfo(info);
            if (!workspace) throw new Error(`Unknown MrKwiz quiz workspace: ${info.id}`);
            await materializeQuizWorkspace(workspace);
        },
        async remove(info) {
            await debug('OpenCode requested MrKwiz quiz workspace removal.', { workspace_id: info.id });
        },
        async target(info) {
            const workspace = workspaceForInfo(info);
            if (!workspace) throw new Error(`Unknown MrKwiz quiz workspace: ${info.id}`);
            await materializeQuizWorkspace(workspace);
            return { type: 'local', directory: workspace.workspaceDirectory };
        },
    });

    const initializeQuizWorkspace = async (
        args: { base_url?: string; label?: string; launch?: boolean; quiz_id: string; quiz_title?: string; token: string },
        sessionID?: string
    ) => {
        const workspaceClient = (client as unknown as { experimental?: { workspace?: OpenCodeWorkspaceClient } }).experimental?.workspace;
        const quizId = args.quiz_id.trim();
        if (!quizId) throw new Error('quiz_id is required.');
        const quizTitle = args.quiz_title?.trim() || args.label?.trim() || 'MrKwiz quiz';
        const entry = await upsertToken({ baseUrl: args.base_url, label: args.label ?? quizTitle, token: args.token }, { scheduleCallback: false });
        const now = new Date().toISOString();
        const existingWorkspace = config.quizWorkspaces[quizId];
        const tokenHashes = uniqueStrings([...(existingWorkspace ? workspaceTokenHashes(existingWorkspace) : []), entry.tokenHash]);
        const workspace: StoredQuizWorkspace = {
            baseUrl: entry.baseUrl,
            createdAt: existingWorkspace?.createdAt ?? now,
            quizId,
            quizTitle,
            tokenHash: existingWorkspace?.tokenHash ?? entry.tokenHash,
            tokenHashes,
            updatedAt: now,
            workspaceDirectory: existingWorkspace?.workspaceDirectory ?? workspaceDirectoryForQuiz(quizId),
            workspaceId: existingWorkspace?.workspaceId ?? workspaceIdForQuiz(quizId),
        };

        config.quizWorkspaces = { ...config.quizWorkspaces, [quizId]: workspace };
        entry.quiz = { id: quizId, title: quizTitle };
        entry.updatedAt = now;
        config.tokens[entry.tokenHash] = entry;
        await saveConfig();
        const materialized = await materializeQuizWorkspace(workspace);

        const workspaceCalls: Record<string, unknown> = {};
        if (!workspaceClient) {
            workspaceCalls.unavailable = 'OpenCode experimental workspace client is not available in this runtime.';
        } else {
            try {
                const syncResult = await workspaceClient.syncList({ directory });
                workspaceCalls.sync_list = syncResult.data ?? true;
            } catch (error) {
                workspaceCalls.sync_list_error = error instanceof Error ? error.message : String(error);
                await debug('Failed to sync OpenCode workspace list.', { error: workspaceCalls.sync_list_error, workspace_id: workspace.workspaceId });
            }

            try {
                const createResult = await workspaceClient.create({
                    branch: null,
                    directory,
                    extra: { quizId: workspace.quizId, tokenHash: entry.tokenHash, tokenHashes: workspaceTokenHashes(workspace) },
                    id: workspace.workspaceId,
                    type: 'mrkwiz-quiz',
                });
                workspaceCalls.create = createResult.data ?? true;
            } catch (error) {
                workspaceCalls.create_error = error instanceof Error ? error.message : String(error);
                await debug('Failed to create OpenCode workspace.', { error: workspaceCalls.create_error, workspace_id: workspace.workspaceId });
            }

            if (args.launch !== false && sessionID) {
                try {
                    const warpResult = await workspaceClient.warp({ copyChanges: false, id: workspace.workspaceId, sessionID });
                    workspaceCalls.warp = warpResult.data ?? true;
                } catch (error) {
                    workspaceCalls.warp_error = error instanceof Error ? error.message : String(error);
                    await debug('Failed to warp session into MrKwiz quiz workspace.', { error: workspaceCalls.warp_error, session_id: sessionID, workspace_id: workspace.workspaceId });
                }
            }
        }

        return {
            ok: true,
            callback_registration: sameDirectory(workspace.workspaceDirectory, directory)
                ? 'owned_by_current_instance'
                : 'will_register_when_workspace_plugin_instance_starts',
            config_file: configFile,
            mcp_name: entry.mcpName,
            mcp_names: tokenEntriesForWorkspace(workspace).map((tokenEntry) => tokenEntry.mcpName),
            note: 'Quiz workspace initialized with static MCP server entries. Raw MCP tokens are stored only in machine-local ignored plugin/workspace files, not in git-tracked files.',
            quiz_id: workspace.quizId,
            quiz_title: workspace.quizTitle,
            token_hash: entry.tokenHash,
            token_hashes: workspaceTokenHashes(workspace),
            workspace_calls: workspaceCalls,
            workspace_directory: workspace.workspaceDirectory,
            workspace_id: workspace.workspaceId,
            workspace_plugin: materialized.pluginEntry,
        };
    };

    const ensureMcpReady = async (entry: StoredToken, reason: string, targetDirectory: string): Promise<McpActivation> => {
        const current = await getOpenCodeMcpStatus(entry.mcpName, targetDirectory);
        if (current.status === 'connected') {
            return {
                changed: false,
                configured_this_prompt: false,
                instance_state_key: targetDirectory,
                mcp_name: entry.mcpName,
                plugin_directory: directory,
                reason,
                status_after: current.status,
                status_before: current.status,
                target_directory: targetDirectory,
                tool_prefix: `${entry.mcpName}_`,
            };
        }

        await client.tui.showToast({
            body: {
                message: `Connecting static MrKwiz MCP ${entry.mcpName}...`,
                variant: 'info',
            },
        }).catch(() => {});
        let connectResult: { data?: unknown } | null = null;
        try {
            connectResult = await client.mcp.connect({ path: { name: entry.mcpName }, query: { directory: targetDirectory } });
        } catch (error) {
            throw new Error(`Static MrKwiz MCP server ${entry.mcpName} is not available in ${targetDirectory}. Reopen the quiz workspace so OpenCode reloads its generated opencode.json. ${error instanceof Error ? error.message : String(error)}`);
        }
        await client.tui.showToast({
            body: {
                message: `MrKwiz MCP ready: ${entry.mcpName}`,
                variant: 'success',
            },
        }).catch(() => {});
        const after = await getOpenCodeMcpStatus(entry.mcpName, targetDirectory);
        if (after.status !== 'connected') {
            throw new Error(`Static MrKwiz MCP server ${entry.mcpName} did not connect in ${targetDirectory}. Reopen the quiz workspace so OpenCode reloads its generated opencode.json.`);
        }
        const activation: McpActivation = {
            changed: current.status !== after.status,
            configured_this_prompt: false,
            instance_state_key: targetDirectory,
            mcp_name: entry.mcpName,
            plugin_directory: directory,
            reason,
            status_after: after.status,
            status_before: current.status,
            target_directory: targetDirectory,
            tool_prefix: `${entry.mcpName}_`,
        };
        await debug('Static MCP token server ready.', { activation, connect_result: connectResult.data, previous_status: current, token_hash: entry.tokenHash });
        return activation;
    };

    const fallbackMcpActivation = (entry: StoredToken, reason: string, targetDirectory: string): McpActivation => ({
        changed: false,
        configured_this_prompt: false,
        instance_state_key: targetDirectory,
        mcp_name: entry.mcpName,
        plugin_directory: directory,
        reason,
        status_after: null,
        status_before: null,
        target_directory: targetDirectory,
        tool_prefix: `${entry.mcpName}_`,
    });

    const mcpStatusMessage = (sessionId: string, activation: McpActivation): string => [
        'MrKwiz plugin status',
        '',
        `MCP server: ${activation.mcp_name}`,
        `Injected prompt session: ${sessionId}`,
        `Plugin startup directory: ${activation.plugin_directory}`,
        `Prompt target directory: ${activation.target_directory}`,
        `OpenCode MCP InstanceState key: ${activation.instance_state_key}`,
        `MCP status before setup: ${activation.status_before ?? 'not reported'}`,
        `MCP status after setup: ${activation.status_after ?? 'not reported'}`,
        `Configured MCP dynamically during this prompt: ${activation.configured_this_prompt ? 'yes' : 'no'}`,
        `Expected OpenCode tool prefix: ${activation.tool_prefix}`,
        `Reason: ${activation.reason}`,
    ].join('\n');

    const appendMcpStatusPrompt = async (sessionId: string, activation: McpActivation) => {
        const message = mcpStatusMessage(sessionId, activation);
        try {
            await client.session.prompt({
                body: {
                    noReply: true,
                    parts: [{ text: message, type: 'text' }],
                },
                path: { id: sessionId },
                query: { directory: activation.target_directory },
            });
            await debug('Appended MrKwiz MCP no-reply status prompt.', { activation, session_id: sessionId });
        } catch (error) {
            await debug('Failed to append MrKwiz MCP no-reply status prompt.', {
                activation,
                error: error instanceof Error ? error.message : String(error),
                session_id: sessionId,
            });
        }
    };

    const runDiagnostics = async (entry: StoredToken, request: BridgeRequest, targetDirectory: string): Promise<DiagnosticReport> => {
        const checks: DiagnosticCheck[] = [];
        const addCheck = (check: DiagnosticCheck) => checks.push(check);
        let mcpActivation: McpActivation | undefined;

        addCheck({
            details: { action: request.action, base_url: entry.baseUrl, callback_url: tokenCallbackUrl(entry.tokenHash) },
            message: 'Local token and callback URL are available.',
            ok: true,
        });

        let activated = false;
        try {
            const activation = await ensureMcpReady(entry, request.action, targetDirectory);
            mcpActivation = activation;
            activated = true;
            addCheck({
                details: { changed: activation.changed, instance_state_key: activation.instance_state_key, mcp_name: entry.mcpName, target_directory: targetDirectory },
                message: 'Static OpenCode MCP server is connected.',
                ok: true,
            });
        } catch (error) {
            await client.tui.showToast({
                body: {
                    message: `MrKwiz static MCP connection failed for ${entry.label ?? entry.tokenHash}.`,
                    variant: 'error',
                },
            }).catch(() => {});
            addCheck({
                details: { error: error instanceof Error ? error.message : String(error) },
                message: 'Static OpenCode MCP server connection failed.',
                ok: false,
            });
        }

        const mcpStatus = await getOpenCodeMcpStatus(entry.mcpName, targetDirectory);
        addCheck({
            details: { ...mcpStatus, instance_state_key: targetDirectory, target_directory: targetDirectory },
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

        return { checks, mcp_activation: mcpActivation, ok: checks.every((check) => check.ok), token_hash: entry.tokenHash };
    };

    const promptSession = async (entry: StoredToken, sessionId: string, prompt: string, model: ModelConfig | undefined, activation: McpActivation) => {
        await appendMcpStatusPrompt(sessionId, activation);
        await client.session.promptAsync({
            body: {
                model,
                parts: [{ text: prompt, type: 'text' }],
            },
            path: { id: sessionId },
            query: { directory: activation.target_directory },
        });
        await debug('Sent MrKwiz injected prompt.', { activation, mcp_name: entry.mcpName, session_id: sessionId, token_hash: entry.tokenHash });
    };

    const createSessionForPrompt = async (entry: StoredToken, prompt: string, payload: BridgePayload, model: ModelConfig | undefined, activation: McpActivation) => {
        const session = await client.session.create({
            body: { title: titleForAction(payload) },
            query: { directory: activation.target_directory },
        });
        if (!session.data?.id) {
            await debug('OpenCode session.create did not return a session id.', { response: session.response, data: session.data });
            throw new Error('OpenCode did not return a session id.');
        }

        const now = new Date().toISOString();
        const quizId = payload.quiz_id?.trim();
        entry.quiz = { id: quizId ?? entry.quiz?.id, title: payload.quiz_title ?? entry.quiz?.title };
        entry.session = {
            createdAt: now,
            directory: activation.target_directory,
            id: session.data.id,
            lastAction: payload.action,
            quizId: quizId ?? entry.quiz?.id,
            quizTitle: payload.quiz_title ?? entry.quiz?.title,
            updatedAt: now,
        };
        entry.updatedAt = now;
        config.tokens[entry.tokenHash] = entry;
        await saveConfig();

        await promptSession(entry, session.data.id, prompt, model, activation);

        await debug('Created MrKwiz OpenCode session.', { mcp_name: entry.mcpName, session_id: session.data.id, target_directory: activation.target_directory, title: titleForAction(payload), token_hash: entry.tokenHash });
        return session.data;
    };

    const tokenForSession = (sessionId: string): StoredToken | undefined => tokenEntries(config).find((entry) => entry.session?.id === sessionId);

    const sessionIsArchived = (session: unknown): boolean => {
        if (!session || typeof session !== 'object' || Array.isArray(session)) return false;
        const input = session as { archived?: unknown; archivedAt?: unknown; status?: unknown; time?: { archived?: unknown } };
        const isSet = (value: unknown): boolean => value !== undefined && value !== null && value !== false && value !== 0 && value !== '';
        return isSet(input.archived) || isSet(input.archivedAt) || input.status === 'archived' || isSet(input.time?.archived);
    };

    const storedSessionIsVisible = async (entry: StoredToken, targetDirectory: string): Promise<boolean> => {
        if (!entry.session?.id) return false;
        const sessions = await client.session.list({ query: { directory: targetDirectory } });
        const visibleSession = sessions.data?.find((session) => session.id === entry.session!.id);
        if (!visibleSession) return false;
        if (sessionIsArchived(visibleSession)) {
            await debug('Stored MrKwiz OpenCode session is archived; creating replacement.', {
                mcp_name: entry.mcpName,
                session_id: entry.session.id,
                target_directory: targetDirectory,
                token_hash: entry.tokenHash,
            });
            return false;
        }
        return true;
    };

    const sendPrompt = async (entry: StoredToken, prompt: string, payload: BridgePayload, options: { ensureMcp?: boolean; mcpActivation?: McpActivation; targetDirectory?: string } = {}) => {
        const targetDirectory = options.targetDirectory ?? targetDirectoryForEntry(entry);
        const activation = options.mcpActivation
            ?? (options.ensureMcp === false
                ? fallbackMcpActivation(entry, payload.action ?? 'open_quiz', targetDirectory)
                : await ensureMcpReady(entry, payload.action ?? 'open_quiz', targetDirectory));
        const model = config.defaultModel ? { modelID: config.defaultModel.modelID, providerID: config.defaultModel.providerID } : undefined;
        const quizId = payload.quiz_id?.trim();

        if (entry.session && await storedSessionIsVisible(entry, targetDirectory)) {
            try {
                await promptSession(entry, entry.session.id, prompt, model, activation);
                const now = new Date().toISOString();
                entry.quiz = { id: quizId ?? entry.quiz?.id, title: payload.quiz_title ?? entry.quiz?.title };
                entry.session = {
                    ...entry.session,
                    directory: targetDirectory,
                    lastAction: payload.action,
                    quizId: quizId ?? entry.session.quizId,
                    quizTitle: payload.quiz_title ?? entry.session.quizTitle,
                    updatedAt: now,
                };
                entry.updatedAt = now;
                config.tokens[entry.tokenHash] = entry;
                await saveConfig();
                await debug('Reused MrKwiz OpenCode session.', { mcp_name: entry.mcpName, quiz_id: quizId, session_id: entry.session.id, target_directory: targetDirectory, title: titleForAction(payload), token_hash: entry.tokenHash });
                return { id: entry.session.id };
            } catch (error) {
                await debug('Stored MrKwiz OpenCode session could not be reused; creating replacement.', {
                    error: error instanceof Error ? error.message : String(error),
                    mcp_name: entry.mcpName,
                    quiz_id: quizId,
                    session_id: entry.session.id,
                    target_directory: targetDirectory,
                    token_hash: entry.tokenHash,
                });
                delete entry.session;
                config.tokens[entry.tokenHash] = entry;
                await saveConfig();
            }
        }

        const session = await createSessionForPrompt(entry, prompt, payload, model, activation);
        const now = new Date().toISOString();
        entry.quiz = { id: quizId ?? entry.quiz?.id, title: payload.quiz_title ?? entry.quiz?.title };
        entry.session = {
            createdAt: now,
            directory: targetDirectory,
            id: session.id,
            lastAction: payload.action,
            quizId: quizId ?? entry.quiz?.id,
            quizTitle: payload.quiz_title ?? entry.quiz?.title,
            updatedAt: now,
        };
        entry.updatedAt = now;
        config.tokens[entry.tokenHash] = entry;
        await saveConfig();
        await debug('Tracked MrKwiz OpenCode session for token.', { mcp_name: entry.mcpName, quiz_id: quizId, session_id: session.id, target_directory: targetDirectory, title: titleForAction(payload), token_hash: entry.tokenHash });
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
        if (!ownsToken(entry.tokenHash)) {
            throw new Error('This MrKwiz token is owned by a quiz workspace plugin instance. Open or refresh the quiz workspace so it can register the active callback URL.');
        }
        const targetDirectory = targetDirectoryForEntry(entry);

        scheduleCallbackRegistration(entry, request.action);
        const diagnostics = await runDiagnostics(entry, request, targetDirectory);

        if (diagnostics.ok) {
            const prompt = buildDesignPrompt(request, diagnostics);
            const session = await sendPrompt(entry, prompt, request.payload, { mcpActivation: diagnostics.mcp_activation, targetDirectory });
            await clearPendingRequest(entry);
            return { diagnostics, pending_request: null, session };
        }

        const pending = await storePendingRequest(request, diagnostics);
        const prompt = buildSetupPrompt(pending, diagnostics);
        const session = await sendPrompt(entry, prompt, request.payload, { ensureMcp: false, mcpActivation: diagnostics.mcp_activation, targetDirectory });
        return { diagnostics, pending_request: pending, session };
    };

    const doPendingRequest = async (args: { clear?: boolean }) => {
        const pendingEntry = ownedTokenEntries().find((entry) => entry.pendingRequest);
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
            note: 'Token saved locally. Callback registration is running in the background. Use mrkwiz_initialize_quiz_workspace for per-quiz static MCP workspace configuration.',
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

    const refreshQuizWorkspaceConfig = async (args: { all?: boolean; quiz_id?: string }) => {
        config = await loadConfig();
        const now = new Date().toISOString();
        const requestedQuizId = args.quiz_id?.trim();
        const currentWorkspace = currentQuizWorkspace();

        const workspaces = requestedQuizId
            ? [config.quizWorkspaces[requestedQuizId]].filter((workspace): workspace is StoredQuizWorkspace => !!workspace)
            : args.all
              ? Object.values(config.quizWorkspaces)
              : currentWorkspace
                ? [currentWorkspace]
                : Object.values(config.quizWorkspaces).length === 1
                  ? Object.values(config.quizWorkspaces)
                  : [];

        if (requestedQuizId && workspaces.length === 0) throw new Error(`Unknown MrKwiz quiz workspace: ${requestedQuizId}`);
        if (workspaces.length === 0) throw new Error('No quiz workspace selected. Pass quiz_id, run from a quiz workspace, or pass all: true.');

        const refreshed = [];
        for (const workspace of workspaces) {
            const workspaceTokens = tokenEntriesForWorkspace(workspace);
            const nextWorkspace: StoredQuizWorkspace = {
                ...workspace,
                tokenHashes: uniqueStrings([...workspaceTokenHashes(workspace), ...workspaceTokens.map((entry) => entry.tokenHash)]),
                updatedAt: now,
            };
            config.quizWorkspaces[nextWorkspace.quizId] = nextWorkspace;
            const materialized = await materializeQuizWorkspace(nextWorkspace);
            refreshed.push({
                mcp_names: workspaceTokens.map((entry) => entry.mcpName),
                quiz_id: nextWorkspace.quizId,
                quiz_title: nextWorkspace.quizTitle,
                token_hashes: workspaceTokenHashes(nextWorkspace),
                workspace_directory: nextWorkspace.workspaceDirectory,
                workspace_id: nextWorkspace.workspaceId,
                workspace_plugin: materialized.pluginEntry,
            });
        }

        await saveConfig();
        await debug('Refreshed MrKwiz quiz workspace config.', { all: args.all === true, quiz_id: requestedQuizId ?? null, refreshed });

        return {
            ok: true,
            config_file: configFile,
            note: 'Generated quiz workspace config refreshed. Reopen/restart the affected OpenCode quiz workspace so static MCP config changes are loaded.',
            refreshed,
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
            mrkwiz_refresh_quiz_workspace_config: tool({
                args: {
                    all: tool.schema.boolean().optional().describe('If true, refresh every stored MrKwiz quiz workspace config.'),
                    quiz_id: tool.schema.string().optional().describe('Optional quiz id to refresh. Defaults to the current quiz workspace, or the only stored workspace if exactly one exists.'),
                },
                description: 'Refresh generated per-quiz OpenCode workspace config, static MCP entries, and ignored token files from machine-local MrKwiz plugin config.',
                async execute(args) {
                    return JSON.stringify(await refreshQuizWorkspaceConfig(args), null, 2);
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
            mrkwiz_initialize_quiz_workspace: tool({
                args: {
                    base_url: tool.schema.string().optional().describe('MrKwiz site base URL. Defaults to MRKWIZ_BASE_URL or http://localhost:3000.'),
                    label: tool.schema.string().optional().describe('Optional local label for this MrKwiz MCP token.'),
                    launch: tool.schema.boolean().optional().describe('If true or omitted, try to warp the current OpenCode session into the quiz workspace.'),
                    quiz_id: tool.schema.string().describe('MrKwiz quiz id for the machine-local workspace.'),
                    quiz_title: tool.schema.string().optional().describe('Human-readable quiz title.'),
                    token: tool.schema.string().describe('Raw MrKwiz MCP token from the admin AI bootstrap page.'),
                },
                description: 'Save a MrKwiz MCP token and initialize the machine-local OpenCode workspace for this quiz.',
                async execute(args, context) {
                    return JSON.stringify(await initializeQuizWorkspace(args, context.sessionID), null, 2);
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
            if (!input.sessionID || !Array.isArray(output.system)) return;
            const entry = tokenForSession(input.sessionID);
            if (entry) {
                const targetDirectory = targetDirectoryForEntry(entry);
                try {
                    await ensureMcpReady(entry, 'chat-system-transform', targetDirectory);
                } catch (error) {
                    await debug('Failed to prepare token MCP during system transform.', {
                        error: error instanceof Error ? error.message : String(error),
                        mcp_name: entry.mcpName,
                        session_id: input.sessionID,
                        target_directory: targetDirectory,
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
