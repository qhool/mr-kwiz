import {
    createQuizMcpTokenRequestSchema,
    getDefaultMcpTokenExpiresAt,
    listQuizMcpTokensResponseSchema,
    quizMcpTokenSchema,
    updateQuizMcpTokenRequestSchema,
} from '../../../src/lib/admin-mcp-tokens';
import { generateCapabilityToken, sha256Hex } from '../../../src/lib/admin-token';

import { type AppEnv } from '../../utils/env';
import { getQuizByAdminKey, json } from './shared';

const bridgeActionSchema = {
    safeParse(value: unknown): { success: true; data: { action: string; payload: Record<string, unknown> } } | { success: false } {
        if (!value || typeof value !== 'object') return { success: false };
        const input = value as Record<string, unknown>;
        if (!['open-quiz', 'edit-theme', 'edit-archetypes', 'edit-question', 'edit-intro', 'edit-scoring'].includes(String(input.action ?? ''))) return { success: false };
        const payload = input.payload && typeof input.payload === 'object' ? input.payload as Record<string, unknown> : {};
        return { success: true, data: { action: String(input.action), payload } };
    },
};

const fetchWithTimeout = async (url: string, init?: RequestInit, timeoutMs = 2500): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
};

const mcpTokenSelect = [
    'id',
    'quiz_id',
    'label',
    'notes',
    'callback_url',
    'callback_origin',
    'expires_at',
    'last_used_at',
    'revoked_at',
    'token_digest',
    'created_at',
    'updated_at',
].join(', ');

const toPublicMcpToken = (row: Record<string, unknown>) => {
    const { token_digest: tokenDigest, ...rest } = row;
    return { ...rest, token_hash: tokenDigest };
};

export const handleAdminMcpTokensGet = async (env: Partial<AppEnv>, adminKey?: string): Promise<Response> => {
    if (!adminKey) {
        return json({ error: 'Missing admin key.' }, { status: 400 });
    }

    try {
        const { quiz, supabase } = await getQuizByAdminKey(env, adminKey);

        if (!quiz) {
            return json({ error: 'Quiz not found.' }, { status: 404 });
        }

        const { data, error } = await supabase
            .from('quiz_mcp_tokens')
            .select(mcpTokenSelect)
            .eq('quiz_id', quiz.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        return json(listQuizMcpTokensResponseSchema.parse({ tokens: (data ?? []).map(toPublicMcpToken) }));
    } catch (error) {
        return json(
            { error: error instanceof Error ? error.message : 'Failed to load MCP tokens.' },
            { status: 500 }
        );
    }
};

export const handleAdminMcpTokensPost = async (
    env: Partial<AppEnv>,
    adminKey: string | undefined,
    request: Request
): Promise<Response> => {
    if (!adminKey) {
        return json({ error: 'Missing admin key.' }, { status: 400 });
    }

    try {
        const { quiz, supabase } = await getQuizByAdminKey(env, adminKey);

        if (!quiz) {
            return json({ error: 'Quiz not found.' }, { status: 404 });
        }

        const payload = createQuizMcpTokenRequestSchema.parse(await request.json());
        const token = generateCapabilityToken();
        const tokenDigest = await sha256Hex(token);

        const { data, error } = await supabase
            .from('quiz_mcp_tokens')
            .insert({
                expires_at: payload.expires_at === undefined ? getDefaultMcpTokenExpiresAt() : payload.expires_at,
                label: payload.label,
                notes: payload.notes,
                quiz_id: quiz.id,
                token_digest: tokenDigest,
            })
            .select(mcpTokenSelect)
            .single();

        if (error) {
            throw error;
        }

        return json({ token, record: quizMcpTokenSchema.parse(toPublicMcpToken(data)) }, { status: 201 });
    } catch (error) {
        return json(
            { error: error instanceof Error ? error.message : 'Failed to create MCP token.' },
            { status: 500 }
        );
    }
};

export const handleAdminMcpTokenPatch = async (
    env: Partial<AppEnv>,
    adminKey: string | undefined,
    tokenId: string | undefined,
    request: Request
): Promise<Response> => {
    if (!adminKey || !tokenId) {
        return json({ error: 'Missing admin key or MCP token id.' }, { status: 400 });
    }

    try {
        const { quiz, supabase } = await getQuizByAdminKey(env, adminKey);

        if (!quiz) {
            return json({ error: 'Quiz not found.' }, { status: 404 });
        }

        const payload = updateQuizMcpTokenRequestSchema.parse(await request.json());
        const { data, error } = await supabase
            .from('quiz_mcp_tokens')
            .update({
                callback_origin: payload.callback_origin,
                callback_url: payload.callback_url,
                expires_at: payload.expires_at,
                label: payload.label,
                notes: payload.notes,
            })
            .eq('id', tokenId)
            .eq('quiz_id', quiz.id)
            .is('deleted_at', null)
            .select(mcpTokenSelect)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data) {
            return json({ error: 'MCP token not found.' }, { status: 404 });
        }

        return json({ token: quizMcpTokenSchema.parse(toPublicMcpToken(data)) });
    } catch (error) {
        return json(
            { error: error instanceof Error ? error.message : 'Failed to update MCP token.' },
            { status: 500 }
        );
    }
};

export const handleAdminMcpTokenRevokePost = async (
    env: Partial<AppEnv>,
    adminKey: string | undefined,
    tokenId: string | undefined
): Promise<Response> => {
    if (!adminKey || !tokenId) {
        return json({ error: 'Missing admin key or MCP token id.' }, { status: 400 });
    }

    try {
        const { quiz, supabase } = await getQuizByAdminKey(env, adminKey);

        if (!quiz) {
            return json({ error: 'Quiz not found.' }, { status: 404 });
        }

        const { data, error } = await supabase
            .from('quiz_mcp_tokens')
            .update({ revoked_at: new Date().toISOString() })
            .eq('id', tokenId)
            .eq('quiz_id', quiz.id)
            .is('deleted_at', null)
            .select(mcpTokenSelect)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data) {
            return json({ error: 'MCP token not found.' }, { status: 404 });
        }

        return json({ token: quizMcpTokenSchema.parse(toPublicMcpToken(data)) });
    } catch (error) {
        return json(
            { error: error instanceof Error ? error.message : 'Failed to revoke MCP token.' },
            { status: 500 }
        );
    }
};

const getOwnedMcpToken = async (env: Partial<AppEnv>, adminKey: string | undefined, tokenId: string | undefined) => {
    if (!adminKey || !tokenId) {
        return { response: json({ error: 'Missing admin key or MCP token id.' }, { status: 400 }) };
    }

    const { quiz, supabase } = await getQuizByAdminKey(env, adminKey);
    if (!quiz) {
        return { response: json({ error: 'Quiz not found.' }, { status: 404 }) };
    }

    const { data, error } = await supabase
        .from('quiz_mcp_tokens')
        .select(mcpTokenSelect)
        .eq('id', tokenId)
        .eq('quiz_id', quiz.id)
        .is('deleted_at', null)
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        return { response: json({ error: 'MCP token not found.' }, { status: 404 }) };
    }

    return { token: quizMcpTokenSchema.parse(toPublicMcpToken(data)) };
};

export const handleAdminMcpTokenCallbackStatusGet = async (
    env: Partial<AppEnv>,
    adminKey: string | undefined,
    tokenId: string | undefined
): Promise<Response> => {
    try {
        const result = await getOwnedMcpToken(env, adminKey, tokenId);
        if ('response' in result) return result.response;
        const token = result.token;

        if (!token.callback_url) {
            return json({ connected: false, error: 'This MCP token does not have a registered OpenCode callback URL.' });
        }

        try {
            const response = await fetchWithTimeout(`${token.callback_url.replace(/\/$/, '')}/status`);
            const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
            if (!response.ok) {
                return json({ connected: false, error: typeof body.error === 'string' ? body.error : 'OpenCode bridge status check failed.' });
            }

            return json(body);
        } catch (error) {
            return json({ connected: false, error: error instanceof Error ? error.message : 'OpenCode bridge is unavailable.' });
        }
    } catch (error) {
        return json({ connected: false, error: error instanceof Error ? error.message : 'OpenCode bridge is unavailable.' }, { status: 502 });
    }
};

export const handleAdminMcpTokenBridgeActionPost = async (
    env: Partial<AppEnv>,
    adminKey: string | undefined,
    tokenId: string | undefined,
    request: Request
): Promise<Response> => {
    try {
        const result = await getOwnedMcpToken(env, adminKey, tokenId);
        if ('response' in result) return result.response;
        const token = result.token;

        if (!token.callback_url) {
            return json({ error: 'This MCP token does not have a registered OpenCode callback URL.' }, { status: 404 });
        }

        const parsed = bridgeActionSchema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
            return json({ error: 'Invalid OpenCode bridge action.' }, { status: 400 });
        }

        const response = await fetchWithTimeout(`${token.callback_url.replace(/\/$/, '')}/${parsed.data.action}`, {
            body: JSON.stringify(parsed.data.payload),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        }, 5000);
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
            return json({ error: typeof body.error === 'string' ? body.error : 'Failed to send action to OpenCode.' }, { status: 502 });
        }

        return json(body);
    } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'OpenCode bridge is unavailable.' }, { status: 502 });
    }
};
