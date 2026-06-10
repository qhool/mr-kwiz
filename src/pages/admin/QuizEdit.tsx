import React from 'react';
import { useParams } from 'react-router-dom';

import { AdminShell } from '../../components/admin-shell';
import { useAdminEditMode } from '../../hooks/useAdminEditMode';
import {
    themeColorsSchema,
    quizDefinitionSchema,
    quizEditPatchSchema,
    type ThemeColors,
    type QuizDefinition,
    type QuizEditPatch,
} from '../../lib/quiz-definition';
import { renderAdminSkillPrompt } from '../../lib/admin-skill-prompt';
import { getQuizMcpTokenStatus } from '../../lib/admin-mcp-tokens';
import { deriveThemeUiColors, resolveThemeColors } from '../../lib/theme-colors';
import { useAdminQuizDefinition } from '../../hooks/useAdminQuizDefinition';
import {
    formatMcpTokenDate,
    getTokenBridgeState,
    useAdminOpenCodeBridge,
} from '../../hooks/useAdminOpenCodeBridge';

type AdminQuizResponse = {
    quiz: {
        current_definition_version: number;
        description: string;
        id: string;
        title: string;
    };
    definition: QuizDefinition;
};

type ThemePreset = {
    id: string;
    label: string;
    colors: ThemeColors;
};

const themePresets: ThemePreset[] = [
    {
        id: 'warm-earth',
        label: 'Warm Earth',
        colors: {
            page_background: '#f4f0e8',
            panel_background: '#f8f7f3',
            panel_border: '#b8ae98',
            heading_text: '#241d14',
            body_text: '#2d2318',
            muted_text: '#6b5734',
            accent: '#6a5032',
            accent_text: '#f6f0df',
            chart_positive: '#a24a34',
            chart_negative: '#245a78',
            chart_grid: '#8f7a57',
            chart_band: '#7a4d2a',
        },
    },
    {
        id: 'sea-glass',
        label: 'Sea Glass',
        colors: {
            page_background: '#eaf4f3',
            panel_background: '#f6fbfb',
            panel_border: '#98b8b3',
            heading_text: '#123232',
            body_text: '#1a4543',
            muted_text: '#3e6a68',
            accent: '#1f6f68',
            accent_text: '#f2fbfa',
            chart_positive: '#2c8f72',
            chart_negative: '#2a5f8f',
            chart_grid: '#86a8a5',
            chart_band: '#2f7c72',
        },
    },
    {
        id: 'sunset-paper',
        label: 'Sunset Paper',
        colors: {
            page_background: '#fdf3e7',
            panel_background: '#fffaf1',
            panel_border: '#d8bca0',
            heading_text: '#412615',
            body_text: '#5a341e',
            muted_text: '#8a5836',
            accent: '#b14d2e',
            accent_text: '#fff5ea',
            chart_positive: '#d0672f',
            chart_negative: '#6a4c8a',
            chart_grid: '#c09b82',
            chart_band: '#9a5a38',
        },
    },
    {
        id: 'forest-lake',
        label: 'Forest Lake',
        colors: {
            page_background: '#eaf0e8',
            panel_background: '#f5f8f3',
            panel_border: '#9fb095',
            heading_text: '#1f311f',
            body_text: '#2e452d',
            muted_text: '#4a6649',
            accent: '#355f3a',
            accent_text: '#f0f7ef',
            chart_positive: '#4d8b44',
            chart_negative: '#2f5977',
            chart_grid: '#8fa389',
            chart_band: '#59744e',
        },
    },
    {
        id: 'rose-mist',
        label: 'Rose Mist',
        colors: {
            page_background: '#fff4f8',
            panel_background: '#fffafd',
            panel_border: '#dfc1cf',
            heading_text: '#4a2335',
            body_text: '#5a2f43',
            muted_text: '#8a5970',
            accent: '#c45d87',
            accent_text: '#fff6fb',
            chart_positive: '#dd7599',
            chart_negative: '#6f5ca8',
            chart_grid: '#c9a8b7',
            chart_band: '#b26b8a',
        },
    },
    {
        id: 'peach-petal',
        label: 'Peach Petal',
        colors: {
            page_background: '#fff5ef',
            panel_background: '#fffdf9',
            panel_border: '#e3c6b5',
            heading_text: '#4f2f25',
            body_text: '#5f3a2f',
            muted_text: '#8a6457',
            accent: '#d47a63',
            accent_text: '#fff7f3',
            chart_positive: '#e18c75',
            chart_negative: '#6f769e',
            chart_grid: '#cfb0a1',
            chart_band: '#b97762',
        },
    },
    {
        id: 'blush-garden',
        label: 'Blush Garden',
        colors: {
            page_background: '#fff6fb',
            panel_background: '#fffdfd',
            panel_border: '#d9c6d5',
            heading_text: '#3f2b36',
            body_text: '#4f3744',
            muted_text: '#7a5b6c',
            accent: '#b76898',
            accent_text: '#fff8fc',
            chart_positive: '#cc79a7',
            chart_negative: '#6075b5',
            chart_grid: '#c3acc0',
            chart_band: '#9e5f86',
        },
    },
    {
        id: 'cotton-sky',
        label: 'Cotton Sky',
        colors: {
            page_background: '#f5f8ff',
            panel_background: '#fbfdff',
            panel_border: '#c5d0e8',
            heading_text: '#243353',
            body_text: '#2f4364',
            muted_text: '#5c7190',
            accent: '#4b79cc',
            accent_text: '#f3f8ff',
            chart_positive: '#6a8fd8',
            chart_negative: '#9b6ec7',
            chart_grid: '#9cb0d0',
            chart_band: '#587fbf',
        },
    },
    {
        id: 'ink-signal',
        label: 'Ink Signal (High Contrast)',
        colors: {
            page_background: '#0f1219',
            panel_background: '#171c26',
            panel_border: '#5f6f8a',
            heading_text: '#f5f8ff',
            body_text: '#dfe8ff',
            muted_text: '#a8b6d6',
            accent: '#29d3a9',
            accent_text: '#06110d',
            chart_positive: '#2be0b4',
            chart_negative: '#ff7a9e',
            chart_grid: '#6b7ea3',
            chart_band: '#23b590',
        },
    },
    {
        id: 'noir-pop',
        label: 'Noir Pop (High Contrast)',
        colors: {
            page_background: '#111111',
            panel_background: '#1a1a1a',
            panel_border: '#f2f2f2',
            heading_text: '#ffffff',
            body_text: '#f5f5f5',
            muted_text: '#d0d0d0',
            accent: '#ffde00',
            accent_text: '#1a1a1a',
            chart_positive: '#ffe24d',
            chart_negative: '#00d4ff',
            chart_grid: '#d9d9d9',
            chart_band: '#f7c900',
        },
    },
];

const swatchOrder: Array<keyof ThemeColors> = [
    'page_background',
    'panel_background',
    'panel_border',
    'heading_text',
    'body_text',
    'muted_text',
    'accent',
    'accent_text',
    'chart_positive',
    'chart_negative',
    'chart_grid',
    'chart_band',
];

const humanizeColorKey = (key: keyof ThemeColors): string => {
    return key
        .split('_')
        .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
        .join(' ');
};

const extractJsonCandidate = (rawText: string): string => {
    const trimmed = rawText.trim();
    const fencedBlocks = [...trimmed.matchAll(/```([a-zA-Z0-9_-]+)?\s*\n?([\s\S]*?)```/g)];

    if (fencedBlocks.length === 0) {
        return trimmed;
    }

    const preferredBlock =
        fencedBlocks.find((match) => (match[1] ?? '').toLowerCase() === 'json') ?? fencedBlocks[0];

    return preferredBlock[2].trim();
};

const QuizEditPage: React.FC = () => {
    const { adminKey } = useParams<{ adminKey: string }>();
    const { definition, error, isLoading, metadata, setDefinition, setError, setMetadata } = useAdminQuizDefinition(adminKey);
    const { editMode, setEditMode } = useAdminEditMode(adminKey);
    const {
        activeBridgeToken,
        bridgeError,
        bridgeMessage,
        bridgeStatuses,
        busyTokenId,
        createBootstrapToken,
        isCreatingToken,
        isLoadingTokens,
        revokeToken,
        sendBridgeAction,
        tokens,
    } = useAdminOpenCodeBridge(adminKey, metadata);
    const [patchText, setPatchText] = React.useState('');
    const [copiedSkillBaselineVersion, setCopiedSkillBaselineVersion] = React.useState<number | null>(null);
    const [message, setMessage] = React.useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [isApplyingTheme, setIsApplyingTheme] = React.useState(false);
    const [selectedThemePresetId, setSelectedThemePresetId] = React.useState('none');
    const colors = React.useMemo(() => resolveThemeColors(definition?.display_config.theme_colors), [definition?.display_config.theme_colors]);
    const ui = React.useMemo(() => deriveThemeUiColors(colors), [colors]);

    const formatError = (submitError: unknown): string => {
        if (submitError instanceof Error) {
            return submitError.message;
        }

        return 'Unknown error.';
    };

    const handleCopySkillPrompt = async () => {
        setError(null);
        setMessage(null);

        if (!definition || !metadata) {
            setError('Quiz definition is not loaded yet.');
            return;
        }

        if (!navigator.clipboard?.writeText) {
            setError('Clipboard API is not available in this browser context.');
            return;
        }

        try {
            const prompt = await renderAdminSkillPrompt(definition, metadata);
            await navigator.clipboard.writeText(prompt);
            setCopiedSkillBaselineVersion(metadata.current_definition_version);
            setMessage(
                `Copied skill prompt to clipboard. Chat baseline locked to definition version ${metadata.current_definition_version}.`
            );
        } catch (copyError) {
            setError(formatError(copyError));
        }
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setMessage(null);

        if (!adminKey) {
            setError('Missing admin key.');
            return;
        }

        try {
            setIsSubmitting(true);
            const parsedPatch = quizEditPatchSchema.parse(JSON.parse(extractJsonCandidate(patchText))) as QuizEditPatch;

            if (
                copiedSkillBaselineVersion !== null &&
                parsedPatch.base_definition_version < copiedSkillBaselineVersion
            ) {
                throw new Error(
                    `This patch was generated from an older baseline than the copied skill prompt (expected at least version ${copiedSkillBaselineVersion}). Copy the skill again into a new chat and regenerate the edit.`
                );
            }

            const patchToSubmit: QuizEditPatch =
                copiedSkillBaselineVersion !== null &&
                parsedPatch.base_definition_version === copiedSkillBaselineVersion &&
                metadata
                    ? {
                          ...parsedPatch,
                          base_definition_version: metadata.current_definition_version,
                      }
                    : parsedPatch;

            const response = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/edit`, {
                body: JSON.stringify(patchToSubmit),
                headers: {
                    'content-type': 'application/json',
                },
                method: 'POST',
            });

            const body = (await response.json()) as Partial<AdminQuizResponse> & { error?: string };
            if (!response.ok) {
                throw new Error(body.error ?? 'Failed to apply patch.');
            }

            const parsedDefinition = quizDefinitionSchema.parse(body.definition);
            setDefinition(parsedDefinition);
            setMetadata(body.quiz as AdminQuizResponse['quiz']);
            setPatchText('');
            setMessage('Patch applied successfully.');
        } catch (submitError) {
            setError(formatError(submitError));
        } finally {
            setIsSubmitting(false);
        }
    };

    const activePreset = React.useMemo(() => {
        return themePresets.find((preset) => preset.id === selectedThemePresetId) ?? null;
    }, [selectedThemePresetId]);

    const handleApplyThemePreset = async () => {
        if (!adminKey || !metadata || !definition) {
            setError('Quiz definition is not loaded yet.');
            return;
        }

        const nextThemeColors =
            selectedThemePresetId === 'none'
                ? undefined
                : themeColorsSchema.parse(activePreset?.colors ?? {});

        const patch: QuizEditPatch = {
            base_definition_version: metadata.current_definition_version,
            operations: nextThemeColors
                ? [
                      {
                          op: 'replace_at_path',
                          path: '/display_config/theme_colors',
                          value: nextThemeColors,
                      },
                  ]
                : [
                      {
                          op: 'remove_at_path',
                          path: '/display_config/theme_colors',
                      },
                  ],
        };

        try {
            setIsApplyingTheme(true);
            setError(null);
            setMessage(null);

            const response = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/edit`, {
                body: JSON.stringify(patch),
                headers: {
                    'content-type': 'application/json',
                },
                method: 'POST',
            });

            const body = (await response.json()) as Partial<AdminQuizResponse> & { error?: string };
            if (!response.ok) {
                throw new Error(body.error ?? 'Failed to apply theme.');
            }

            const parsedDefinition = quizDefinitionSchema.parse(body.definition);
            setDefinition(parsedDefinition);
            setMetadata(body.quiz as AdminQuizResponse['quiz']);
            setMessage(nextThemeColors ? 'Theme applied.' : 'Theme colors cleared.');
        } catch (submitError) {
            setError(formatError(submitError));
        } finally {
            setIsApplyingTheme(false);
        }
    };

    return (
        <AdminShell adminKey={adminKey} currentPage="edit" metadata={metadata} themeColors={definition?.display_config.theme_colors}>
            <header style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ marginBottom: '0.5rem' }}>Quiz Builder</h1>
                <p style={{ margin: 0 }}>
                    {metadata
                        ? `${metadata.title} · definition version ${metadata.current_definition_version}`
                        : 'Loading quiz definition...'}
                </p>
                {definition ? (
                    <p style={{ color: colors.muted_text, margin: '0.35rem 0 0' }}>
                        Question ordering: <strong>{definition.question_ordering ?? 'ordered'}</strong>
                        {definition.question_ordering === 'adaptive' && definition.scoring_config.adaptive_selection
                            ? ` · adaptive config present (min ${definition.scoring_config.adaptive_selection.min_questions}–max ${definition.scoring_config.adaptive_selection.max_questions} questions)`
                            : definition.question_ordering === 'adaptive'
                            ? ' · ⚠ adaptive_selection config missing in scoring_config'
                            : null}
                    </p>
                ) : null}
                <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1rem' }}>
                    <label
                        style={{
                            color: colors.body_text,
                            display: 'grid',
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            gap: '0.35rem',
                        }}
                    >
                        Edit mode
                        <select
                            onChange={(event) => setEditMode(event.target.value === 'paste-back' ? 'paste-back' : 'opencode')}
                            style={{
                                background: colors.panel_background,
                                border: `1px solid ${colors.panel_border}`,
                                borderRadius: 999,
                                color: colors.body_text,
                                fontSize: '0.95rem',
                                padding: '0.6rem 0.85rem',
                            }}
                            value={editMode}
                        >
                            <option value="opencode">OpenCode</option>
                            <option value="paste-back">Paste-back</option>
                        </select>
                    </label>
                    <span style={{ color: colors.muted_text, fontSize: '0.9rem' }}>
                        Preview follows this mode. Return here to change it.
                    </span>
                </div>
            </header>

            {editMode === 'opencode' ? (
                <section
                    style={{
                        background: colors.panel_background,
                        border: `1px solid ${colors.panel_border}`,
                        borderRadius: 18,
                        marginBottom: '1rem',
                        padding: '1rem',
                    }}
                >
                    <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                        <div>
                            <h2 style={{ margin: 0 }}>OpenCode Editing</h2>
                            <p style={{ color: colors.muted_text, margin: '0.35rem 0 0' }}>
                                Use the local OpenCode bridge and hosted MCP tools for saved edits.
                            </p>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <button
                                disabled={!activeBridgeToken || !metadata}
                                onClick={() => {
                                    void sendBridgeAction(activeBridgeToken, 'open-quiz');
                                }}
                                style={{
                                    background: colors.accent,
                                    border: 'none',
                                    borderRadius: 999,
                                    color: colors.accent_text,
                                    cursor: activeBridgeToken && metadata ? 'pointer' : 'not-allowed',
                                    padding: '0.65rem 1rem',
                                }}
                                type="button"
                            >
                                Open in OpenCode
                            </button>
                            <button
                                disabled={isCreatingToken || isLoading || !metadata}
                                onClick={() => {
                                    void createBootstrapToken();
                                }}
                                style={{
                                    background: colors.page_background,
                                    border: `1px solid ${colors.panel_border}`,
                                    borderRadius: 999,
                                    color: colors.body_text,
                                    cursor: isCreatingToken || isLoading || !metadata ? 'not-allowed' : 'pointer',
                                    padding: '0.65rem 1rem',
                                }}
                                type="button"
                            >
                                {isCreatingToken ? 'Creating...' : 'Create Token and Copy Bootstrap Prompt'}
                            </button>
                        </div>
                    </div>

                    {isLoadingTokens ? <p>Loading tokens...</p> : null}
                    {!isLoadingTokens && tokens.length === 0 ? (
                        <p style={{ color: colors.muted_text }}>No MCP tokens have been created yet.</p>
                    ) : null}
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
                                    <p style={{ color: colors.muted_text, margin: '0.5rem 0' }}>Expires: {formatMcpTokenDate(token.expires_at)} · Last used: {formatMcpTokenDate(token.last_used_at)}</p>
                                    <p style={{ color: colors.muted_text, margin: '0.5rem 0' }}>Token hash: <code>{token.token_hash.slice(0, 12)}...</code></p>
                                    <p style={{ color: colors.muted_text, margin: '0.5rem 0' }}>Callback: {token.callback_url ?? 'Not registered'}</p>
                                    {token.callback_url && status === 'active' ? (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.65rem' }}>
                                            <button
                                                onClick={() => { void sendBridgeAction(token, 'open-quiz'); }}
                                                style={{ background: colors.accent, border: 'none', borderRadius: 999, color: colors.accent_text, cursor: 'pointer', padding: '0.45rem 0.8rem' }}
                                                type="button"
                                            >
                                                {bridgeState === 'active' ? 'Open in OpenCode' : 'Open in OpenCode (make active)'}
                                            </button>
                                            <button
                                                onClick={() => { void sendBridgeAction(token, 'edit-theme'); }}
                                                style={{ background: 'transparent', border: `1px solid ${colors.panel_border}`, borderRadius: 999, color: colors.accent, cursor: 'pointer', padding: '0.45rem 0.8rem' }}
                                                type="button"
                                            >
                                                Edit Theme
                                            </button>
                                            <button
                                                onClick={() => { void sendBridgeAction(token, 'edit-archetypes'); }}
                                                style={{ background: 'transparent', border: `1px solid ${colors.panel_border}`, borderRadius: 999, color: colors.accent, cursor: 'pointer', padding: '0.45rem 0.8rem' }}
                                                type="button"
                                            >
                                                Edit Archetypes
                                            </button>
                                        </div>
                                    ) : null}
                                    <button
                                        disabled={busyTokenId === token.id || !!token.revoked_at}
                                        onClick={() => { void revokeToken(token); }}
                                        style={{ background: 'transparent', border: `1px solid ${ui.danger_border}`, borderRadius: 999, color: ui.danger_text, cursor: busyTokenId === token.id || token.revoked_at ? 'not-allowed' : 'pointer', padding: '0.45rem 0.8rem' }}
                                        type="button"
                                    >
                                        {busyTokenId === token.id ? 'Revoking...' : 'Revoke'}
                                    </button>
                                </article>
                            );
                        })}
                    </div>
                </section>
            ) : null}

            <section
                style={{
                    background: colors.panel_background,
                    border: `1px solid ${colors.panel_border}`,
                    borderRadius: 14,
                    marginBottom: '1rem',
                    padding: '1rem',
                }}
            >
                <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.4rem' }}>Theme Presets</h2>
                <p style={{ color: colors.muted_text, margin: '0 0 0.75rem' }}>
                    Select a preset to apply only <code>display_config.theme_colors</code>. Other display settings are left unchanged.
                </p>
                <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
                    <select
                        onChange={(event) => setSelectedThemePresetId(event.target.value)}
                        style={{
                            background: colors.page_background,
                            border: `1px solid ${colors.panel_border}`,
                            borderRadius: 10,
                            color: colors.body_text,
                            fontSize: '0.95rem',
                            minWidth: 220,
                            padding: '0.55rem 0.65rem',
                        }}
                        value={selectedThemePresetId}
                    >
                        <option value="none">No Theme (clear theme colors)</option>
                        {themePresets.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                                {preset.label}
                            </option>
                        ))}
                    </select>
                    <button
                        disabled={isApplyingTheme || isLoading || !definition || !metadata}
                        onClick={() => {
                            void handleApplyThemePreset();
                        }}
                        style={{
                            background: colors.accent,
                            border: 'none',
                            borderRadius: 999,
                            color: colors.accent_text,
                            cursor: isApplyingTheme || isLoading || !definition || !metadata ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            padding: '0.55rem 1rem',
                        }}
                        type="button"
                    >
                        {isApplyingTheme ? 'Applying...' : 'Apply Theme'}
                    </button>
                </div>
                {activePreset ? (
                    <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: '0.85rem' }}>
                        {swatchOrder.map((key) => {
                            const color = activePreset.colors[key];
                            if (!color) {
                                return null;
                            }

                            return (
                                <div
                                    key={key}
                                    style={{
                                        alignItems: 'center',
                                        background: colors.page_background,
                                        border: `1px solid ${colors.panel_border}`,
                                        borderRadius: 10,
                                        display: 'flex',
                                        gap: '0.55rem',
                                        padding: '0.45rem 0.55rem',
                                    }}
                                >
                                    <span
                                        aria-hidden
                                        style={{
                                            background: color,
                                            border: '1px solid rgba(0,0,0,0.16)',
                                            borderRadius: 8,
                                            display: 'inline-block',
                                            flexShrink: 0,
                                            height: 18,
                                            width: 18,
                                        }}
                                    />
                                    <span style={{ color: colors.body_text, fontSize: '0.82rem' }}>
                                        {humanizeColorKey(key)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                ) : null}
            </section>

            {error ? (
                <div
                    style={{
                        background: ui.danger_background,
                        border: `1px solid ${ui.danger_border}`,
                        color: ui.danger_text,
                        marginBottom: '1rem',
                        padding: '0.75rem 1rem',
                        whiteSpace: 'pre-wrap',
                    }}
                >
                    {error}
                </div>
            ) : null}

            {bridgeError ? (
                <div
                    style={{
                        background: ui.danger_background,
                        border: `1px solid ${ui.danger_border}`,
                        color: ui.danger_text,
                        marginBottom: '1rem',
                        padding: '0.75rem 1rem',
                        whiteSpace: 'pre-wrap',
                    }}
                >
                    {bridgeError}
                </div>
            ) : null}

            {message ? (
                <div
                    style={{
                        background: ui.success_background,
                        border: `1px solid ${ui.success_border}`,
                        color: ui.success_text,
                        marginBottom: '1rem',
                        padding: '0.75rem 1rem',
                    }}
                >
                    {message}
                </div>
            ) : null}

            {bridgeMessage ? (
                <div
                    style={{
                        background: ui.success_background,
                        border: `1px solid ${ui.success_border}`,
                        color: ui.success_text,
                        marginBottom: '1rem',
                        padding: '0.75rem 1rem',
                    }}
                >
                    {bridgeMessage}
                </div>
            ) : null}

            <div
                style={{
                    display: 'grid',
                    gap: '1.5rem',
                    gridTemplateColumns: editMode === 'paste-back' ? 'minmax(0, 1.2fr) minmax(320px, 0.8fr)' : 'minmax(0, 1fr)',
                }}
            >
                <section>
                    <h2>Current Definition</h2>
                    <div
                        style={{
                            background: colors.panel_background,
                            border: `1px solid ${colors.panel_border}`,
                            borderRadius: 12,
                            maxHeight: '70vh',
                            overflow: 'auto',
                            padding: '1rem',
                        }}
                    >
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {isLoading
                                ? 'Loading...'
                                : JSON.stringify(definition, null, 2)}
                        </pre>
                    </div>
                </section>

                {editMode === 'paste-back' ? (
                <section>
                    <h2>Paste-Back Patch</h2>
                    <button
                        disabled={isLoading || !definition || !metadata}
                        onClick={() => {
                            void handleCopySkillPrompt();
                        }}
                        style={{
                            background: colors.accent,
                            border: 'none',
                            borderRadius: 999,
                            color: colors.accent_text,
                            cursor: isLoading || !definition || !metadata ? 'not-allowed' : 'pointer',
                            marginBottom: '1rem',
                            padding: '0.75rem 1.25rem',
                        }}
                        type="button"
                    >
                        Copy LLM Skill Prompt
                    </button>
                    <form onSubmit={handleSubmit}>
                        {copiedSkillBaselineVersion !== null ? (
                            <p style={{ color: colors.muted_text, marginTop: 0 }}>
                                Current chat baseline: definition version {copiedSkillBaselineVersion}
                            </p>
                        ) : null}
                        <textarea
                            aria-label="Quiz edit patch JSON"
                            disabled={isLoading || isSubmitting}
                            onChange={(event) => setPatchText(event.target.value)}
                            placeholder={JSON.stringify(
                                {
                                    base_definition_version:
                                        copiedSkillBaselineVersion ?? metadata?.current_definition_version ?? 1,
                                    operations: [
                                        {
                                            op: 'update_quiz_metadata',
                                            title: 'Refined quiz title',
                                        },
                                    ],
                                },
                                null,
                                2
                            )}
                            spellCheck={false}
                            style={{
                                border: `1px solid ${colors.panel_border}`,
                                borderRadius: 12,
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                fontSize: '0.95rem',
                                minHeight: '28rem',
                                padding: '1rem',
                                resize: 'vertical',
                                width: '100%',
                            }}
                            value={patchText}
                        />
                        <button
                            disabled={isLoading || isSubmitting || patchText.trim().length === 0}
                            style={{
                                background: colors.body_text,
                                border: 'none',
                                borderRadius: 999,
                                color: colors.accent_text,
                                cursor: 'pointer',
                                marginTop: '1rem',
                                padding: '0.75rem 1.25rem',
                            }}
                            type="submit"
                        >
                            {isSubmitting ? 'Applying…' : 'Apply Patch'}
                        </button>
                    </form>
                </section>
                ) : null}
            </div>
        </AdminShell>
    );
};

export default QuizEditPage;
