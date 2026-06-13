import React from 'react';

import {
    getQuizMcpTokenStatus,
    listQuizMcpTokensResponseSchema,
    type QuizMcpToken,
} from '../lib/admin-mcp-tokens';
import type { AdminQuizMetadata } from './useAdminQuizDefinition';

type CreateTokenResponse = {
    error?: string;
    record?: QuizMcpToken;
    token?: string;
};

export type BridgeTokenStatus = {
    connected?: boolean;
    mcp_name?: string;
    session?: { id?: string; quiz_title?: string | null; updated_at?: string } | null;
    token_hash?: string;
};

export type TokenBridgeState = 'valid' | 'connected' | 'unavailable';

export type AdminBridgeAction =
    | 'open-quiz'
    | 'edit-theme'
    | 'edit-archetypes'
    | 'edit-question'
    | 'edit-intro'
    | 'edit-scoring';

export const formatAdminBridgeError = (error: unknown): string =>
    error instanceof Error ? error.message : 'Unknown error.';

export const formatMcpTokenDate = (value: string | null): string => (value ? new Date(value).toLocaleString() : 'Never');

const isLocalHost = (hostname: string): boolean =>
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '[::1]';

const shouldUseLocalProxy = (): boolean => {
    if (typeof window === 'undefined') return false;
    return isLocalHost(window.location.hostname) || window.location.port === '3000';
};

const buildBootstrapPrompt = (input: {
    baseUrl: string;
    expiresAt: string | null;
    mcpToken: string;
    tokenHash: string;
    quizTitle: string;
}) => {
    const skillsUrl = `${input.baseUrl}/.well-known/skills/`;
    const mcpUrl = `${input.baseUrl}/mcp`;

    return [
        'You are helping me connect OpenCode to my MrKwiz quiz. Please guide me step by step and do not assume I know where config files live.',
        'First load the OpenCode skill named mrkwiz-opencode-setup and follow its setup/testing flow.',
        '',
        `Quiz: ${input.quizTitle}`,
        `MrKwiz site: ${input.baseUrl}`,
        `Hosted MCP URL: ${mcpUrl}`,
        `OpenCode skill URL: ${skillsUrl}`,
        `MCP token hash: ${input.tokenHash}`,
        `MCP token expiration: ${formatMcpTokenDate(input.expiresAt)}`,
        '',
        'Please do these things:',
        '1. Configure OpenCode to load MrKwiz skills from the skills URL.',
        '2. Configure OpenCode to install the npm plugin @mrkwiz/opencode-plugin.',
        '3. If the mrkwiz_configure_default_model tool is available, set the MrKwiz plugin default model to the exact model currently running this bootstrap conversation. Use the provider/model identifier from your system context. This prevents MrKwiz-created sessions from selecting a model I cannot use.',
        '4. If the mrkwiz_configure_mcp tool is available, call it with the MCP token, base URL, and label below. This saves the token in the MrKwiz OpenCode plugin config and registers a callback URL. The plugin creates a token-specific MCP server and session when the admin page sends an OpenCode action for this token.',
        '5. If mrkwiz_configure_default_model or mrkwiz_configure_mcp is not available yet, install or fix the plugin first. Do not manually configure the MrKwiz MCP server in opencode.json.',
        '6. Make sure .opencode/mrkwiz.json is ignored by git and never committed because it contains raw MCP tokens and local model preferences.',
        '7. Tell me clearly if I need to quit and restart OpenCode for plugin/config changes to take effect.',
        '8. After the plugin saves this token, refresh the MrKwiz admin Edit page. It should show this token as connected. Clicking Open in OpenCode creates or reuses the token-owned OpenCode session and injects the MCP server name.',
        '9. Confirm when the MrKwiz admin page should show OpenCode buttons.',
        '',
        'Recommended OpenCode config shape:',
        '```json',
        JSON.stringify(
            {
                $schema: 'https://opencode.ai/config.json',
                skills: { urls: [skillsUrl] },
                plugin: ['@mrkwiz/opencode-plugin'],
            },
            null,
            2
        ),
        '```',
        '',
        `MCP token: ${input.mcpToken}`,
        '',
        'Preferred plugin tool calls once available:',
        'First set the default model to the exact provider/model running this bootstrap conversation, for example:',
        'mrkwiz_configure_default_model({ "model": "provider/model-id-from-your-system-context" })',
        '',
        'Then save the MCP token:',
        `mrkwiz_configure_mcp({ "base_url": "${input.baseUrl}", "label": "${input.quizTitle}", "token": "${input.mcpToken}" })`,
        '',
        'The plugin status endpoint and callback URLs use only the token hash. The raw token should only be used as bearer auth by the plugin.',
        '',
        'If any step cannot be completed automatically, explain the exact next step in plain language. If the MCP token is expired, tell me to create a replacement token from the MrKwiz Edit page and paste the new bootstrap prompt.',
    ].join('\n');
};

export const getTokenBridgeState = (token: QuizMcpToken, bridgeStatus?: BridgeTokenStatus): TokenBridgeState => {
    if (getQuizMcpTokenStatus(token) !== 'active') return 'unavailable';
    if (bridgeStatus?.connected) return 'connected';
    return 'valid';
};

const copyText = async (text: string) => {
    if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API is not available in this browser context.');
    }
    await navigator.clipboard.writeText(text);
};

export const useAdminOpenCodeBridge = (adminKey: string | undefined, metadata: AdminQuizMetadata | null) => {
    const [tokens, setTokens] = React.useState<QuizMcpToken[]>([]);
    const [bridgeError, setBridgeError] = React.useState<string | null>(null);
    const [bridgeMessage, setBridgeMessage] = React.useState<string | null>(null);
    const [isLoadingTokens, setIsLoadingTokens] = React.useState(true);
    const [isCreatingToken, setIsCreatingToken] = React.useState(false);
    const [busyTokenId, setBusyTokenId] = React.useState<string | null>(null);
    const [bridgeStatuses, setBridgeStatuses] = React.useState<Record<string, BridgeTokenStatus>>({});

    const loadTokens = React.useCallback(async () => {
        if (!adminKey) {
            setBridgeError('Missing admin key.');
            setIsLoadingTokens(false);
            return;
        }

        setIsLoadingTokens(true);
        setBridgeError(null);

        try {
            const response = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/mcp-tokens`);
            const body = (await response.json()) as { error?: string; tokens?: QuizMcpToken[] };
            if (!response.ok) {
                throw new Error(body.error ?? 'Failed to load MCP tokens.');
            }
            setTokens(listQuizMcpTokensResponseSchema.parse(body).tokens);
        } catch (error) {
            setBridgeError(formatAdminBridgeError(error));
        } finally {
            setIsLoadingTokens(false);
        }
    }, [adminKey]);

    React.useEffect(() => {
        void loadTokens();
    }, [loadTokens]);

    React.useEffect(() => {
        let cancelled = false;

        const loadBridgeStatuses = async () => {
            const entries = await Promise.all(
                tokens.map(async (token): Promise<[string, BridgeTokenStatus | null]> => {
                    if (!adminKey || !token.callback_url || getQuizMcpTokenStatus(token) !== 'active') return [token.id, null];
                    try {
                        const callbackUrl = `${token.callback_url.replace(/\/$/, '')}/status`;
                        const response = await fetch(
                            shouldUseLocalProxy()
                                ? `/api/admin/${encodeURIComponent(adminKey)}/mcp-tokens/${encodeURIComponent(token.id)}/callback-status`
                                : callbackUrl
                        );
                        if (!response.ok) return [token.id, null];
                        const body = (await response.json()) as BridgeTokenStatus;
                        if (body.token_hash && body.token_hash !== token.token_hash) return [token.id, null];
                        return [token.id, body];
                    } catch {
                        return [token.id, null];
                    }
                })
            );
            if (cancelled) return;
            setBridgeStatuses(
                Object.fromEntries(entries.filter((entry): entry is [string, BridgeTokenStatus] => entry[1] !== null))
            );
        };

        void loadBridgeStatuses();
        return () => {
            cancelled = true;
        };
    }, [adminKey, tokens]);

    const connectedBridgeToken = React.useMemo(() => {
        return (
            tokens.find((token) => getTokenBridgeState(token, bridgeStatuses[token.id]) === 'connected') ??
            tokens.find((token) => token.callback_url && getQuizMcpTokenStatus(token) === 'active') ??
            null
        );
    }, [bridgeStatuses, tokens]);

    const createBootstrapToken = React.useCallback(async () => {
        setBridgeMessage(null);
        setBridgeError(null);
        if (!adminKey || !metadata) {
            setBridgeError('Quiz metadata is not loaded yet.');
            return;
        }

        try {
            setIsCreatingToken(true);
            const response = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/mcp-tokens`, {
                body: JSON.stringify({ label: 'OpenCode setup token', notes: 'Created from OpenCode bootstrap flow.' }),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            });
            const body = (await response.json()) as CreateTokenResponse;
            if (!response.ok || !body.token || !body.record) {
                throw new Error(body.error ?? 'Failed to create MCP token.');
            }

            const prompt = buildBootstrapPrompt({
                baseUrl: window.location.origin,
                expiresAt: body.record.expires_at,
                mcpToken: body.token,
                tokenHash: body.record.token_hash,
                quizTitle: metadata.title,
            });
            await copyText(prompt);
            setTokens((current) => [body.record as QuizMcpToken, ...current]);
            setBridgeMessage('Created a 30-day OpenCode MCP token and copied the bootstrap prompt. Paste it into OpenCode, then refresh this page.');
        } catch (error) {
            setBridgeError(formatAdminBridgeError(error));
        } finally {
            setIsCreatingToken(false);
        }
    }, [adminKey, metadata]);

    const revokeToken = React.useCallback(
        async (token: QuizMcpToken) => {
            if (!adminKey) return;
            setBridgeMessage(null);
            setBridgeError(null);

            try {
                setBusyTokenId(token.id);
                const response = await fetch(
                    `/api/admin/${encodeURIComponent(adminKey)}/mcp-tokens/${encodeURIComponent(token.id)}/revoke`,
                    { method: 'POST' }
                );
                const body = (await response.json()) as { error?: string; token?: QuizMcpToken };
                if (!response.ok || !body.token) {
                    throw new Error(body.error ?? 'Failed to revoke MCP token.');
                }
                setTokens((current) => current.map((entry) => (entry.id === body.token!.id ? body.token! : entry)));
                setBridgeMessage('MCP token revoked.');
            } catch (error) {
                setBridgeError(formatAdminBridgeError(error));
            } finally {
                setBusyTokenId(null);
            }
        },
        [adminKey]
    );

    const sendBridgeAction = React.useCallback(
        async (token: QuizMcpToken | null, action: AdminBridgeAction, payload: Record<string, unknown> = {}) => {
            setBridgeMessage(null);
            setBridgeError(null);
            if (!adminKey || !token?.callback_url || !metadata) {
                setBridgeError('This MCP token does not have a registered OpenCode callback URL yet.');
                return false;
            }

            try {
                const useLocalProxy = shouldUseLocalProxy();
                const bridgePayload = {
                    definition_version: metadata.current_definition_version,
                    quiz_id: metadata.id,
                    quiz_title: metadata.title,
                    ...payload,
                };
                const response = await fetch(
                    useLocalProxy
                        ? `/api/admin/${encodeURIComponent(adminKey)}/mcp-tokens/${encodeURIComponent(token.id)}/bridge-action`
                        : `${token.callback_url.replace(/\/$/, '')}/${action}`,
                    {
                        body: JSON.stringify(useLocalProxy ? { action, payload: bridgePayload } : bridgePayload),
                        headers: { 'content-type': 'application/json' },
                        method: 'POST',
                    }
                );
                const body = (await response.json().catch(() => ({}))) as { error?: string };
                if (!response.ok) {
                    throw new Error(body.error ?? 'Failed to send action to OpenCode.');
                }
                setBridgeMessage('Sent the request to OpenCode.');
                return true;
            } catch (error) {
                setBridgeError(
                    `${formatAdminBridgeError(error)} If OpenCode is not running, restart it after bootstrap setup and refresh this page.`
                );
                return false;
            }
        },
        [adminKey, metadata]
    );

    return {
        connectedBridgeToken,
        bridgeError,
        bridgeMessage,
        bridgeStatuses,
        busyTokenId,
        createBootstrapToken,
        isCreatingToken,
        isLoadingTokens,
        loadTokens,
        revokeToken,
        sendBridgeAction,
        setBridgeError,
        setBridgeMessage,
        tokens,
    };
};
