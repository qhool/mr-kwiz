import {
    buildMcpTokenExpiredRecoveryInstructions,
    getQuizMcpTokenStatus,
} from '../../src/lib/admin-mcp-tokens';
import { sha256Hex } from '../../src/lib/admin-token';
import {
    applyQuizEditPatch,
    hashQuestion,
    quizDefinitionSchema,
    quizEditPatchSchema,
    type QuizDefinition,
} from '../../src/lib/quiz-definition';
import { getMrKwizMcpToolsList } from '../../src/lib/mrkwiz-mcp-tools';
import type { Database } from '../../src/types/database.generated';

import { type AppEnv, getAppEnv } from '../utils/env';
import { createServerSupabaseClient } from '../utils/supabase';
import { json } from './admin/shared';

type JsonRpcRequest = {
    id?: string | number | null;
    jsonrpc?: string;
    method?: string;
    params?: unknown;
};

type QuizRow = Database['public']['Tables']['quizzes']['Row'];
type McpTokenRow = Database['public']['Tables']['quiz_mcp_tokens']['Row'];

type McpAuthContext = {
    quiz: QuizRow;
    token: McpTokenRow;
    supabase: ReturnType<typeof createServerSupabaseClient>;
};

const jsonRpcResult = (id: JsonRpcRequest['id'], result: unknown) =>
    json({ jsonrpc: '2.0', id: id ?? null, result });

const jsonRpcError = (id: JsonRpcRequest['id'], code: number, message: string, data?: unknown) =>
    json({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } });

const toolResult = (value: unknown) => ({
    content: [
        {
            type: 'text',
            text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
        },
    ],
});

const getBearerToken = (request: Request): string | null => {
    const authorization = request.headers.get('authorization') ?? '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
};

const authenticateMcp = async (env: Partial<AppEnv>, request: Request): Promise<McpAuthContext | Response> => {
    const bearerToken = getBearerToken(request);
    if (!bearerToken) {
        return jsonRpcError(null, -32000, 'Missing MrKwiz MCP bearer token.');
    }

    const appEnv = getAppEnv(env);
    const supabase = createServerSupabaseClient(appEnv);
    const tokenDigest = await sha256Hex(bearerToken);
    const { data, error } = await supabase
        .from('quiz_mcp_tokens')
        .select('*, quizzes(*)')
        .eq('token_digest', tokenDigest)
        .is('deleted_at', null)
        .maybeSingle();

    if (error) {
        return jsonRpcError(null, -32000, error.message);
    }

    const row = data as (McpTokenRow & { quizzes: QuizRow | null }) | null;
    if (!row || !row.quizzes) {
        return jsonRpcError(null, -32000, 'Invalid MrKwiz MCP token.');
    }

    const status = getQuizMcpTokenStatus(row);
    if (status === 'expired') {
        return jsonRpcError(null, -32001, 'This MrKwiz MCP token has expired.', {
            code: 'MRKWIZ_MCP_TOKEN_EXPIRED',
            recovery_instructions: buildMcpTokenExpiredRecoveryInstructions(),
        });
    }

    if (status === 'revoked') {
        return jsonRpcError(null, -32002, 'This MrKwiz MCP token has been revoked.', {
            code: 'MRKWIZ_MCP_TOKEN_REVOKED',
            recovery_instructions: buildMcpTokenExpiredRecoveryInstructions(),
        });
    }

    await supabase.from('quiz_mcp_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', row.id);

    return { quiz: row.quizzes, token: row, supabase };
};

const summarizeDefinition = async (definition: QuizDefinition) => ({
    archetypes: definition.display_config.archetypes.map((archetype) => ({
        id: archetype.id,
        is_main: archetype.is_main,
        name: archetype.name,
    })),
    definition_version: definition.definition_version,
    display_config: {
        archetype_name_template: definition.display_config.archetype_name_template,
        has_theme_colors: !!definition.display_config.theme_colors,
        intro_markdown: definition.display_config.intro_markdown,
        trait_polarity: definition.display_config.trait_polarity,
    },
    question_ordering: definition.question_ordering ?? 'ordered',
    questions: await Promise.all(
        definition.questions.map(async (question) => ({
            id: question.id,
            prompt: question.prompt,
            responses: question.responses.length,
            old_question_hash: await hashQuestion(question),
        }))
    ),
    scoring_config: definition.scoring_config,
    traits: definition.traits.map((trait) => ({
        id: trait.id,
        label: trait.label,
        low_label: trait.low_label,
        high_label: trait.high_label,
    })),
});

const validateCallbackUrl = (value: string): string => {
    const url = new URL(value);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
        throw new Error('callback_url must be an http://localhost or http://127.0.0.1 URL.');
    }
    return url.toString();
};

const executeToolCall = async (ctx: McpAuthContext, name: string, args: unknown) => {
    const definition = quizDefinitionSchema.parse(ctx.quiz.current_definition);
    const params = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;

    switch (name) {
        case 'get_quiz_context':
            return toolResult({
                quiz: {
                    id: ctx.quiz.id,
                    title: ctx.quiz.title,
                    description: ctx.quiz.description,
                    current_definition_version: ctx.quiz.current_definition_version,
                },
                definition: await summarizeDefinition(definition),
                reminders: [
                    'Fetch question context before replacing or deleting a question.',
                    'Validate edits before applying them.',
                    'Ask for confirmation before applying unless the user clearly requested direct application.',
                ],
            });

        case 'get_question_context': {
            const questionId = String(params.question_id ?? '');
            const question = definition.questions.find((entry) => entry.id === questionId);
            if (!question) throw new Error(`Question ${questionId} was not found.`);
            return toolResult({
                base_definition_version: ctx.quiz.current_definition_version,
                old_question_hash: await hashQuestion(question),
                question,
                trait_order: definition.traits.map((trait) => trait.id),
            });
        }

        case 'get_edit_capabilities':
            return toolResult({
                base_definition_version: ctx.quiz.current_definition_version,
                explicit_operations: [
                    'update_quiz_metadata',
                    'replace_display_config',
                    'replace_scoring_config',
                    'set_traits',
                    'update_trait_text',
                    'reorder_traits',
                    'create_question',
                    'replace_question',
                    'delete_question',
                    'reorder_questions',
                    'create_archetype',
                    'replace_archetype',
                    'delete_archetype',
                    'reorder_archetypes',
                    'replace_at_path',
                    'merge_at_path',
                    'remove_at_path',
                ],
                path_operations: {
                    allowed_prefixes: ['/title', '/description', '/question_ordering', '/display_config', '/scoring_config'],
                    blocked_prefixes: ['/questions', '/traits', '/display_config/archetypes'],
                },
                structure_locked: definition.questions.length > 0,
            });

        case 'validate_edit': {
            const patch = quizEditPatchSchema.parse(params.patch);
            const nextDefinition = await applyQuizEditPatch(definition, patch);
            return toolResult({ ok: true, definition: await summarizeDefinition(nextDefinition) });
        }

        case 'apply_edit': {
            const patch = quizEditPatchSchema.parse(params.patch);
            if (patch.base_definition_version !== ctx.quiz.current_definition_version) {
                throw new Error(`Definition version conflict. Current version is ${ctx.quiz.current_definition_version}.`);
            }
            const nextDefinition = await applyQuizEditPatch(definition, patch);
            const nextVersion = ctx.quiz.current_definition_version + 1;
            const persistedDefinition = quizDefinitionSchema.parse({ ...nextDefinition, definition_version: nextVersion });
            const { error } = await ctx.supabase
                .from('quizzes')
                .update({
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    current_definition: persistedDefinition as any,
                    current_definition_version: nextVersion,
                    title: persistedDefinition.title,
                    description: persistedDefinition.description,
                })
                .eq('id', ctx.quiz.id);
            if (error) throw error;
            return toolResult({ ok: true, current_definition_version: nextVersion });
        }

        case 'set_callback_url': {
            const callbackUrl = validateCallbackUrl(String(params.callback_url ?? ''));
            const callbackOrigin = params.callback_origin === undefined ? null : String(params.callback_origin);
            const { error } = await ctx.supabase
                .from('quiz_mcp_tokens')
                .update({ callback_url: callbackUrl, callback_origin: callbackOrigin })
                .eq('id', ctx.token.id);
            if (error) throw error;
            return toolResult({ ok: true, callback_url: callbackUrl });
        }

        case 'clear_callback_url': {
            const { error } = await ctx.supabase
                .from('quiz_mcp_tokens')
                .update({ callback_url: null, callback_origin: null })
                .eq('id', ctx.token.id);
            if (error) throw error;
            return toolResult({ ok: true });
        }

        default:
            throw new Error(`Unknown MrKwiz MCP tool: ${name}`);
    }
};

export const handleMcpPost = async (env: Partial<AppEnv>, request: Request): Promise<Response> => {
    let rpc: JsonRpcRequest;
    try {
        rpc = (await request.json()) as JsonRpcRequest;
    } catch {
        return jsonRpcError(null, -32700, 'Invalid JSON-RPC request.');
    }

    if (rpc.method === 'initialize') {
        return jsonRpcResult(rpc.id, {
            protocolVersion: '2025-06-18',
            serverInfo: { name: 'mrkwiz', version: '0.1.0' },
            capabilities: { tools: {} },
            instructions: 'Use these tools for MrKwiz quiz authoring and editing. Fetch context, validate edits, and apply only after appropriate user confirmation.',
        });
    }

    if (rpc.method === 'notifications/initialized') {
        return new Response(null, { status: 204 });
    }

    const auth = await authenticateMcp(env, request);
    if (auth instanceof Response) return auth;

    try {
        if (rpc.method === 'tools/list') {
            return jsonRpcResult(rpc.id, getMrKwizMcpToolsList());
        }

        if (rpc.method === 'tools/call') {
            const params = (rpc.params && typeof rpc.params === 'object' ? rpc.params : {}) as { name?: string; arguments?: unknown };
            if (!params.name) throw new Error('Missing tool name.');
            return jsonRpcResult(rpc.id, await executeToolCall(auth, params.name, params.arguments));
        }

        return jsonRpcError(rpc.id, -32601, `Unsupported MCP method: ${rpc.method ?? 'unknown'}`);
    } catch (error) {
        return jsonRpcError(rpc.id, -32000, error instanceof Error ? error.message : 'MCP tool call failed.');
    }
};

export const handleMcpOptions = async (): Promise<Response> =>
    new Response(null, {
        headers: {
            'access-control-allow-headers': 'authorization, content-type',
            'access-control-allow-methods': 'POST, OPTIONS',
            'access-control-allow-origin': '*',
        },
        status: 204,
    });

export const handleMcpGet = async (): Promise<Response> =>
    json(
        {
            error: 'MrKwiz MCP uses streamable HTTP JSON-RPC over POST. Send JSON-RPC requests to this endpoint with POST.',
        },
        {
            headers: { allow: 'POST, OPTIONS' },
            status: 405,
        }
    );
