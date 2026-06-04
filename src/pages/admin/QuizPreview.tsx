import React from 'react';
import { useParams } from 'react-router-dom';

import { AdminShell } from '../../components/admin-shell';
import {
    QuizIntroScreen,
    QuizResultsScreen,
} from '../../components/quiz-preview';
import { AdminPreviewQuestionsPanel } from '../../components/admin-preview-questions-panel';
import { useAdminQuizDefinition } from '../../hooks/useAdminQuizDefinition';
import { buildAdminQuestionEditPrompt } from '../../lib/admin-question-edit-prompt';
import { quizDefinitionSchema, quizEditPatchSchema, type Question, type QuizDefinition } from '../../lib/quiz-definition';
import { selectArchetype, type TraitStatistics } from '../../lib/respondent-quiz';
import { deriveThemeUiColors, resolveThemeColors } from '../../lib/theme-colors';

type AdminQuizResponse = {
    quiz: {
        current_definition_version: number;
        description: string;
        id: string;
        title: string;
    };
    definition: QuizDefinition;
};

type PreviewScreen =
    | { type: 'intro' }
    | { type: 'questions' }
    | { type: 'results' };

const screenButtonStyle = (isActive: boolean, accent: string, accentText: string, panelBackground: string, panelBorder: string, bodyText: string): React.CSSProperties => ({
    background: isActive ? accent : panelBackground,
    border: `1px solid ${isActive ? accent : panelBorder}`,
    borderRadius: 14,
    color: isActive ? accentText : bodyText,
    cursor: 'pointer',
    display: 'block',
    fontSize: '0.95rem',
    padding: '0.9rem 1rem',
    textAlign: 'left',
    width: '100%',
});

const buildInitialScores = (traitIds: string[], scaleMin: number, scaleMax: number) => {
    const midpoint = (scaleMin + scaleMax) / 2;
    return Object.fromEntries(traitIds.map((traitId) => [traitId, midpoint]));
};

const buildInitialUncertainty = (traitIds: string[]) => {
    return Object.fromEntries(traitIds.map((traitId) => [traitId, 0.25]));
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

const QuizPreviewPage: React.FC = () => {
    const { adminKey } = useParams<{ adminKey: string }>();
    const {
        definition,
        error,
        isLoading,
        metadata,
        setDefinition,
        setError,
        setMetadata,
    } = useAdminQuizDefinition(adminKey);

    const [selectedScreen, setSelectedScreen] = React.useState<PreviewScreen>({ type: 'intro' });
    const [previewScores, setPreviewScores] = React.useState<Record<string, number>>({});
    const [previewUncertainty, setPreviewUncertainty] = React.useState<Record<string, number>>({});
    const [patchText, setPatchText] = React.useState('');
    const [isPatchBoxOpen, setIsPatchBoxOpen] = React.useState(false);
    const [isSubmittingPatch, setIsSubmittingPatch] = React.useState(false);
    const [message, setMessage] = React.useState<string | null>(null);
    const colors = React.useMemo(() => resolveThemeColors(definition?.display_config.theme_colors), [definition?.display_config.theme_colors]);
    const ui = React.useMemo(() => deriveThemeUiColors(colors), [colors]);

    React.useEffect(() => {
        if (!definition) {
            return;
        }

        const scaleMin = definition.display_config.result_scale_min ?? -1;
        const scaleMax = definition.display_config.result_scale_max ?? 1;
        setPreviewScores((current) => {
            const traitIds = definition.traits.map((trait) => trait.id);
            const missingTrait = traitIds.some((traitId) => !(traitId in current));
            const extraTrait = Object.keys(current).some((traitId) => !traitIds.includes(traitId));

            if (!missingTrait && !extraTrait) {
                return current;
            }

            return buildInitialScores(traitIds, scaleMin, scaleMax);
        });

        setPreviewUncertainty((current) => {
            const traitIds = definition.traits.map((trait) => trait.id);
            const missingTrait = traitIds.some((traitId) => !(traitId in current));
            const extraTrait = Object.keys(current).some((traitId) => !traitIds.includes(traitId));

            if (!missingTrait && !extraTrait) {
                return current;
            }

            return buildInitialUncertainty(traitIds);
        });
    }, [definition]);

    const scaleMin = definition?.display_config.result_scale_min ?? -1;
    const scaleMax = definition?.display_config.result_scale_max ?? 1;
    const scaleRange = Math.max(0.1, Math.abs(scaleMax - scaleMin));

    const previewTraitStats = React.useMemo<Record<string, TraitStatistics>>(() => {
        if (!definition) {
            return {};
        }

        return Object.fromEntries(
            definition.traits.map((trait) => {
                const estimate = previewScores[trait.id] ?? (scaleMin + scaleMax) / 2;
                const uncertaintyControl = previewUncertainty[trait.id] ?? 0;

                // Intentionally overdrive the top end so 1.0 explores beyond realistic uncertainty.
                const baseline = Math.max(Math.abs(estimate), scaleRange * 0.2);
                const spread = Math.pow(uncertaintyControl, 1.15) * baseline * 3;

                return [
                    trait.id,
                    {
                        contradiction: spread * spread,
                        estimate,
                        spread,
                    },
                ];
            })
        );
    }, [definition, previewScores, previewUncertainty, scaleMax, scaleMin, scaleRange]);

    const previewSelectedArchetype = React.useMemo(() => {
        if (!definition) {
            return undefined;
        }

        return selectArchetype(definition, previewTraitStats);
    }, [definition, previewTraitStats]);

    const handleCopyQuestionEditPrompt = async (question: Question) => {
        setError(null);
        setMessage(null);
        setIsPatchBoxOpen(true);

        if (!navigator.clipboard?.writeText) {
            setError('Clipboard API is not available in this browser context.');
            return;
        }

        try {
            if (!metadata) {
                setError('Quiz metadata is not loaded yet.');
                return;
            }

            const prompt = await buildAdminQuestionEditPrompt(
                question,
                metadata.current_definition_version
            );
            await navigator.clipboard.writeText(prompt);
            setMessage('Copied replace-question patch prompt to clipboard. Paste it into your current LLM session.');
        } catch (copyError) {
            setError(copyError instanceof Error ? copyError.message : 'Failed to copy the question edit prompt.');
        }
    };

    const handleApplyPatch = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setMessage(null);

        if (!adminKey) {
            setError('Missing admin key.');
            return;
        }

        try {
            setIsSubmittingPatch(true);
            const parsedPatch = quizEditPatchSchema.parse(JSON.parse(extractJsonCandidate(patchText)));

            const response = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/edit`, {
                body: JSON.stringify(parsedPatch),
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
            setIsPatchBoxOpen(false);
            setMessage('Patch applied successfully.');
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Unknown error.');
        } finally {
            setIsSubmittingPatch(false);
        }
    };

    return (
        <AdminShell adminKey={adminKey} currentPage="preview" metadata={metadata} themeColors={definition?.display_config.theme_colors}>
            <header style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.9rem', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ marginBottom: '0.35rem' }}>Quiz Preview</h1>
                    <p style={{ margin: 0 }}>
                        {metadata
                            ? `${metadata.title} · definition version ${metadata.current_definition_version}`
                            : 'Loading quiz definition...'}
                    </p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <button
                        onClick={() => {
                            setError(null);
                            setMessage(null);
                            setIsPatchBoxOpen((current) => !current);
                        }}
                        style={{
                            background: isPatchBoxOpen ? colors.body_text : colors.accent,
                            border: 'none',
                            borderRadius: 999,
                            color: colors.accent_text,
                            cursor: 'pointer',
                            padding: '0.7rem 1.15rem',
                        }}
                        type="button"
                    >
                        {isPatchBoxOpen ? 'Close Patch Box' : 'Paste Patch'}
                    </button>
                </div>
            </header>

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

            {isPatchBoxOpen ? (
                <section
                    style={{
                        background: colors.panel_background,
                        border: `1px solid ${colors.panel_border}`,
                        borderRadius: 18,
                        marginBottom: '1.5rem',
                        padding: '1rem',
                    }}
                >
                    <div style={{ alignItems: 'center', display: 'flex', gap: '0.75rem', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                        <div>
                            <h2 style={{ fontSize: '1rem', margin: 0 }}>Paste Patch</h2>
                            <p style={{ color: colors.muted_text, margin: '0.35rem 0 0' }}>
                                Paste a patch returned from chat. Fenced JSON blocks are accepted.
                            </p>
                        </div>
                        <button
                            onClick={() => setIsPatchBoxOpen(false)}
                            style={{
                                background: 'transparent',
                                border: `1px solid ${colors.panel_border}`,
                                borderRadius: 999,
                                color: colors.body_text,
                                cursor: 'pointer',
                                padding: '0.55rem 0.9rem',
                            }}
                            type="button"
                        >
                            Close
                        </button>
                    </div>
                    <form onSubmit={handleApplyPatch}>
                        <textarea
                            aria-label="Quiz edit patch JSON"
                            disabled={isLoading || isSubmittingPatch}
                            onChange={(event) => setPatchText(event.target.value)}
                            placeholder={JSON.stringify(
                                {
                                    base_definition_version: metadata?.current_definition_version ?? 1,
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
                                minHeight: '14rem',
                                padding: '1rem',
                                resize: 'vertical',
                                width: '100%',
                            }}
                            value={patchText}
                        />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1rem' }}>
                            <button
                                disabled={isLoading || isSubmittingPatch || patchText.trim().length === 0}
                                style={{
                                    background: colors.body_text,
                                    border: 'none',
                                    borderRadius: 999,
                                    color: colors.accent_text,
                                    cursor: 'pointer',
                                    padding: '0.75rem 1.25rem',
                                }}
                                type="submit"
                            >
                                {isSubmittingPatch ? 'Applying…' : 'Apply Patch'}
                            </button>
                            <button
                                disabled={isSubmittingPatch}
                                onClick={() => setIsPatchBoxOpen(false)}
                                style={{
                                    background: colors.page_background,
                                    border: `1px solid ${colors.panel_border}`,
                                    borderRadius: 999,
                                    color: colors.body_text,
                                    cursor: 'pointer',
                                    padding: '0.75rem 1.25rem',
                                }}
                                type="button"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </section>
            ) : null}

            <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: '320px minmax(0, 1fr)' }}>
                <aside>
                    <div
                        style={{
                            background: colors.panel_background,
                            border: `1px solid ${colors.panel_border}`,
                            borderRadius: 18,
                            padding: '1rem',
                        }}
                    >
                        <h2 style={{ fontSize: '1rem', margin: '0 0 0.85rem' }}>Preview Screens</h2>
                        <div style={{ display: 'grid', gap: '0.65rem' }}>
                            <button onClick={() => setSelectedScreen({ type: 'intro' })} style={screenButtonStyle(selectedScreen.type === 'intro', colors.accent, colors.accent_text, colors.page_background, colors.panel_border, colors.body_text)} type="button">
                                Intro
                            </button>
                            <button onClick={() => setSelectedScreen({ type: 'questions' })} style={screenButtonStyle(selectedScreen.type === 'questions', colors.accent, colors.accent_text, colors.page_background, colors.panel_border, colors.body_text)} type="button">
                                Questions
                            </button>
                            <button onClick={() => setSelectedScreen({ type: 'results' })} style={screenButtonStyle(selectedScreen.type === 'results', colors.accent, colors.accent_text, colors.page_background, colors.panel_border, colors.body_text)} type="button">
                                Results
                            </button>
                        </div>
                    </div>

                    <div
                        style={{
                            background: colors.panel_background,
                            border: `1px solid ${colors.panel_border}`,
                            borderRadius: 18,
                            marginTop: '1rem',
                            padding: '1rem',
                        }}
                    >
                        <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>Admin Controls</h2>
                        {selectedScreen.type === 'results' && definition ? (
                            definition.traits.length > 0 ? (
                                <div style={{ display: 'grid', gap: '0.8rem' }}>
                                    {definition.traits.map((trait) => (
                                        <div key={trait.id} style={{ background: colors.page_background, border: `1px solid ${colors.panel_border}`, borderRadius: 12, display: 'grid', gap: '0.5rem', padding: '0.65rem 0.75rem' }}>
                                            <span style={{ color: colors.body_text, fontSize: '0.95rem', fontWeight: 700 }}>{trait.label}</span>
                                            <label style={{ display: 'grid', gap: '0.3rem' }}>
                                                <span style={{ color: colors.body_text, fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.02em' }}>Estimate</span>
                                                <input
                                                    max={scaleMax}
                                                    min={scaleMin}
                                                    onChange={(event) => {
                                                        const value = Number(event.target.value);
                                                        setPreviewScores((current) => ({ ...current, [trait.id]: value }));
                                                    }}
                                                    step={0.05}
                                                    type="range"
                                                    value={previewScores[trait.id] ?? (scaleMin + scaleMax) / 2}
                                                />
                                                <span style={{ color: colors.muted_text, fontSize: '0.82rem' }}>Value: {(previewScores[trait.id] ?? (scaleMin + scaleMax) / 2).toFixed(2)}</span>
                                            </label>
                                            <label style={{ display: 'grid', gap: '0.3rem' }}>
                                                <span style={{ color: colors.body_text, fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.02em' }}>Uncertainty Scale</span>
                                                <input
                                                    max={1}
                                                    min={0}
                                                    onChange={(event) => {
                                                        const value = Number(event.target.value);
                                                        setPreviewUncertainty((current) => ({ ...current, [trait.id]: value }));
                                                    }}
                                                    step={0.01}
                                                    type="range"
                                                    value={previewUncertainty[trait.id] ?? 0.25}
                                                />
                                                <span style={{ color: colors.muted_text, fontSize: '0.82rem' }}>
                                                    Control: {(previewUncertainty[trait.id] ?? 0.25).toFixed(2)} · Spread: {(previewTraitStats[trait.id]?.spread ?? 0).toFixed(2)}
                                                </span>
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ color: colors.muted_text }}>Define traits before previewing results scores.</div>
                            )
                        ) : (
                            <div style={{ color: colors.muted_text }}>Select the Results screen to adjust preview scores.</div>
                        )}
                    </div>
                </aside>

                <main>
                    {isLoading || !definition ? (
                        <div
                            style={{
                                background: colors.panel_background,
                                border: `1px solid ${colors.panel_border}`,
                                borderRadius: 18,
                                padding: '1.5rem',
                            }}
                        >
                            Loading preview...
                        </div>
                    ) : null}

                    {!isLoading && definition && selectedScreen.type === 'intro' ? <QuizIntroScreen definition={definition} themeColors={definition.display_config.theme_colors} /> : null}
                    {!isLoading && definition && selectedScreen.type === 'questions' ? (
                        <AdminPreviewQuestionsPanel
                            definition={definition}
                            onCopyQuestionEditPrompt={handleCopyQuestionEditPrompt}
                        />
                    ) : null}
                    {!isLoading && definition && selectedScreen.type === 'results' ? (
                        <QuizResultsScreen
                            completionMarkdown={definition.display_config.completion_markdown}
                            scaleMax={scaleMax}
                            scaleMin={scaleMin}
                            scores={previewScores}
                            selectedArchetype={previewSelectedArchetype}
                            traitPolarity={definition.display_config.trait_polarity}
                            traitStats={previewTraitStats}
                            traits={definition.traits}
                            themeColors={definition.display_config.theme_colors}
                        />
                    ) : null}
                </main>
            </div>
        </AdminShell>
    );
};

export default QuizPreviewPage;