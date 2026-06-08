import React from 'react';
import { useParams } from 'react-router-dom';

import { AdminShell } from '../../components/admin-shell';
import { useAdminQuizDefinition } from '../../hooks/useAdminQuizDefinition';
import {
    getQuizMcpTokenStatus,
    listQuizMcpTokensResponseSchema,
    type QuizMcpToken,
} from '../../lib/admin-mcp-tokens';
import { deriveThemeUiColors, resolveThemeColors } from '../../lib/theme-colors';

type CreateTokenResponse = {
    error?: string;
    record?: QuizMcpToken;
    token?: string;
};

const formatError = (error: unknown): string => (error instanceof Error ? error.message : 'Unknown error.');

const formatDate = (value: string | null): string => (value ? new Date(value).toLocaleString() : 'Never');

const isLocalHost = (hostname: string): boolean => hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

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
        `MCP token expiration: ${formatDate(input.expiresAt)}`,
        '',
        'Please do these things:',
        '1. Configure OpenCode to load MrKwiz skills from the skills URL.',
        '2. Configure OpenCode to install the npm plugin @mrkwiz/opencode-plugin.',
        '3. If the mrkwiz_configure_default_model tool is available, set the MrKwiz plugin default model to the exact model currently running this bootstrap conversation. Use the provider/model identifier from your system context. This prevents MrKwiz-created sessions from selecting a model I cannot use.',
        '4. If the mrkwiz_configure_mcp tool is available, call it with the MCP token, base URL, and label below. This saves the token in the MrKwiz OpenCode plugin config and registers a callback URL. It does not activate MCP until the admin page sends an OpenCode action for this token.',
        '5. If mrkwiz_configure_default_model or mrkwiz_configure_mcp is not available yet, install or fix the plugin first. Do not manually configure the MrKwiz MCP server in opencode.json.',
        '6. Make sure .opencode/mrkwiz.json is ignored by git and never committed because it contains raw MCP tokens and local model preferences.',
        '7. Tell me clearly if I need to quit and restart OpenCode for plugin/config changes to take effect.',
        '8. After the plugin saves this token, refresh the MrKwiz admin AI page. It should show this token as connected. Clicking Open in OpenCode activates MCP for this token.',
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
        'If any step cannot be completed automatically, explain the exact next step in plain language. If the MCP token is expired, tell me to create a replacement token from the MrKwiz AI page and paste the new bootstrap prompt.',
    ].join('\n');
};

type BridgeTokenStatus = {
    active?: boolean;
    connected?: boolean;
    token_hash?: string;
};

type TokenBridgeState = 'valid' | 'connected' | 'active' | 'unavailable';

const getTokenBridgeState = (token: QuizMcpToken, bridgeStatus?: BridgeTokenStatus): TokenBridgeState => {
    if (getQuizMcpTokenStatus(token) !== 'active') return 'unavailable';
    if (bridgeStatus?.active) return 'active';
    if (bridgeStatus?.connected) return 'connected';
    return 'valid';
};

const QuizAiPage: React.FC = () => {
    const { adminKey } = useParams<{ adminKey: string }>();
    const { definition, error: quizError, isLoading, metadata } = useAdminQuizDefinition(adminKey);
    const colors = React.useMemo(() => resolveThemeColors(definition?.display_config.theme_colors), [definition?.display_config.theme_colors]);
    const ui = React.useMemo(() => deriveThemeUiColors(colors), [colors]);
    const [tokens, setTokens] = React.useState<QuizMcpToken[]>([]);
    const [pageError, setPageError] = React.useState<string | null>(null);
    const [message, setMessage] = React.useState<string | null>(null);
    const [isLoadingTokens, setIsLoadingTokens] = React.useState(true);
    const [isCreating, setIsCreating] = React.useState(false);
    const [busyTokenId, setBusyTokenId] = React.useState<string | null>(null);
    const [bridgeStatuses, setBridgeStatuses] = React.useState<Record<string, BridgeTokenStatus>>({});

    const loadTokens = React.useCallback(async () => {
        if (!adminKey) {
            setPageError('Missing admin key.');
            setIsLoadingTokens(false);
            return;
        }

        setIsLoadingTokens(true);
        setPageError(null);

        try {
            const response = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/mcp-tokens`);
            const body = (await response.json()) as { error?: string; tokens?: QuizMcpToken[] };
            if (!response.ok) {
                throw new Error(body.error ?? 'Failed to load MCP tokens.');
            }
            setTokens(listQuizMcpTokensResponseSchema.parse(body).tokens);
        } catch (error) {
            setPageError(formatError(error));
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
                            isLocalHost(window.location.hostname)
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

    const copyText = async (text: string) => {
        if (!navigator.clipboard?.writeText) {
            throw new Error('Clipboard API is not available in this browser context.');
        }
        await navigator.clipboard.writeText(text);
    };

    const handleCreateBootstrap = async () => {
        setMessage(null);
        setPageError(null);
        if (!adminKey || !metadata) {
            setPageError('Quiz metadata is not loaded yet.');
            return;
        }

        try {
            setIsCreating(true);
            const response = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/mcp-tokens`, {
                body: JSON.stringify({ label: 'OpenCode setup token', notes: 'Created from AI bootstrap flow.' }),
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
            setMessage('Created a 30-day OpenCode MCP token and copied the bootstrap prompt. Paste it into OpenCode, then refresh this page.');
        } catch (error) {
            setPageError(formatError(error));
        } finally {
            setIsCreating(false);
        }
    };

    const handleRevoke = async (token: QuizMcpToken) => {
        if (!adminKey) return;
        setMessage(null);
        setPageError(null);

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
            setMessage('MCP token revoked.');
        } catch (error) {
            setPageError(formatError(error));
        } finally {
            setBusyTokenId(null);
        }
    };

    const handleBridgeAction = async (token: QuizMcpToken, action: 'open-quiz' | 'edit-theme' | 'edit-archetypes') => {
        setMessage(null);
        setPageError(null);
        if (!adminKey || !token.callback_url || !metadata) {
            setPageError('This MCP token does not have a registered OpenCode callback URL yet.');
            return;
        }

        try {
            const useLocalProxy = isLocalHost(window.location.hostname);
            const response = await fetch(useLocalProxy ? `/api/admin/${encodeURIComponent(adminKey)}/mcp-tokens/${encodeURIComponent(token.id)}/bridge-action` : `${token.callback_url.replace(/\/$/, '')}/${action}`, {
                body: JSON.stringify(
                    useLocalProxy ? {
                        action,
                        payload: {
                            definition_version: metadata.current_definition_version,
                            quiz_id: metadata.id,
                            quiz_title: metadata.title,
                        },
                    } : {
                        definition_version: metadata.current_definition_version,
                        quiz_id: metadata.id,
                        quiz_title: metadata.title,
                    }
                ),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            });
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) {
                throw new Error(body.error ?? 'Failed to send action to OpenCode.');
            }
            setMessage('Sent the request to OpenCode.');
        } catch (error) {
            setPageError(
                `${formatError(error)} If OpenCode is not running, restart it after bootstrap setup and refresh this page.`
            );
        }
    };

    return (
        <AdminShell adminKey={adminKey} currentPage="ai" metadata={metadata} themeColors={definition?.display_config.theme_colors}>
            <header style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ marginBottom: '0.5rem' }}>AI Editing</h1>
                <p style={{ margin: 0 }}>Connect OpenCode through hosted MCP, local bridge buttons, or the existing paste-back flow.</p>
            </header>

            {quizError ? <div style={{ background: ui.danger_background, border: `1px solid ${ui.danger_border}`, color: ui.danger_text, marginBottom: '1rem', padding: '0.8rem 1rem' }}>{quizError}</div> : null}
            {pageError ? <div style={{ background: ui.danger_background, border: `1px solid ${ui.danger_border}`, color: ui.danger_text, marginBottom: '1rem', padding: '0.8rem 1rem' }}>{pageError}</div> : null}
            {message ? <div style={{ background: ui.success_background, border: `1px solid ${ui.success_border}`, color: ui.success_text, marginBottom: '1rem', padding: '0.8rem 1rem' }}>{message}</div> : null}

            <section style={{ background: colors.panel_background, border: `1px solid ${colors.panel_border}`, borderRadius: 18, marginBottom: '1rem', padding: '1rem' }}>
                <h2 style={{ marginTop: 0 }}>MCP Tokens</h2>
                {isLoadingTokens ? <p>Loading tokens...</p> : null}
                {!isLoadingTokens && tokens.length === 0 ? <p style={{ color: colors.muted_text }}>No MCP tokens have been created yet.</p> : null}
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {tokens.map((token) => {
                        const status = getQuizMcpTokenStatus(token);
                        const bridgeState = getTokenBridgeState(token, bridgeStatuses[token.id]);
                        const bridgeLabel = bridgeState === 'active' ? 'active' : bridgeState === 'connected' ? 'connected' : bridgeState === 'valid' ? 'valid' : status;
                        return (
                            <article key={token.id} style={{ border: `1px solid ${colors.panel_border}`, borderRadius: 14, padding: '0.9rem' }}>
                                <div style={{ alignItems: 'center', display: 'flex', gap: '0.75rem', justifyContent: 'space-between' }}>
                                    <strong>{token.label || 'OpenCode token'}</strong>
                                    <span style={{ border: `1px solid ${colors.panel_border}`, borderRadius: 999, padding: '0.25rem 0.6rem' }}>{bridgeLabel}</span>
                                </div>
                                <p style={{ color: colors.muted_text, margin: '0.5rem 0' }}>Expires: {formatDate(token.expires_at)} · Last used: {formatDate(token.last_used_at)}</p>
                                <p style={{ color: colors.muted_text, margin: '0.5rem 0' }}>Token hash: <code>{token.token_hash.slice(0, 12)}...</code></p>
                                <p style={{ color: colors.muted_text, margin: '0.5rem 0' }}>Callback: {token.callback_url ?? 'Not registered'}</p>
                                {token.callback_url && status === 'active' ? (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.65rem' }}>
                                        <button
                                            onClick={() => { void handleBridgeAction(token, 'open-quiz'); }}
                                            style={{ background: colors.accent, border: 'none', borderRadius: 999, color: colors.accent_text, cursor: 'pointer', padding: '0.45rem 0.8rem' }}
                                            type="button"
                                        >
                                            {bridgeState === 'active' ? 'Open in OpenCode' : 'Open in OpenCode (make active)'}
                                        </button>
                                        <button
                                            onClick={() => { void handleBridgeAction(token, 'edit-theme'); }}
                                            style={{ background: 'transparent', border: `1px solid ${colors.panel_border}`, borderRadius: 999, color: colors.accent, cursor: 'pointer', padding: '0.45rem 0.8rem' }}
                                            type="button"
                                        >
                                            Edit Theme
                                        </button>
                                        <button
                                            onClick={() => { void handleBridgeAction(token, 'edit-archetypes'); }}
                                            style={{ background: 'transparent', border: `1px solid ${colors.panel_border}`, borderRadius: 999, color: colors.accent, cursor: 'pointer', padding: '0.45rem 0.8rem' }}
                                            type="button"
                                        >
                                            Edit Archetypes
                                        </button>
                                    </div>
                                ) : null}
                                <button
                                    disabled={busyTokenId === token.id || !!token.revoked_at}
                                    onClick={() => { void handleRevoke(token); }}
                                    style={{ background: 'transparent', border: `1px solid ${ui.danger_border}`, borderRadius: 999, color: ui.danger_text, cursor: 'pointer', padding: '0.45rem 0.8rem' }}
                                    type="button"
                                >
                                    {busyTokenId === token.id ? 'Revoking...' : 'Revoke'}
                                </button>
                            </article>
                        );
                    })}
                </div>
            </section>

            <section style={{ background: colors.panel_background, border: `1px solid ${colors.panel_border}`, borderRadius: 18, marginBottom: '1rem', padding: '1rem' }}>
                <h2 style={{ marginTop: 0 }}>OpenCode Setup</h2>
                <p style={{ color: colors.muted_text }}>Creates a scoped MCP token that expires in 30 days, then copies a setup prompt for OpenCode. Use this only when you need to add or replace a local OpenCode token.</p>
                <button
                    disabled={isCreating || isLoading || !metadata}
                    onClick={() => { void handleCreateBootstrap(); }}
                    style={{ background: colors.accent, border: 'none', borderRadius: 999, color: colors.accent_text, cursor: 'pointer', padding: '0.75rem 1.1rem' }}
                    type="button"
                >
                    {isCreating ? 'Creating...' : 'Create Token and Copy Bootstrap Prompt'}
                </button>
            </section>

            <section style={{ background: colors.panel_background, border: `1px solid ${colors.panel_border}`, borderRadius: 18, padding: '1rem' }}>
                <h2 style={{ marginTop: 0 }}>Paste-Back Fallback</h2>
                <p style={{ color: colors.muted_text }}>The existing copy/paste patch workflow remains available from the Edit and Preview pages if MCP or OpenCode setup is unavailable.</p>
            </section>
        </AdminShell>
    );
};

export default QuizAiPage;
