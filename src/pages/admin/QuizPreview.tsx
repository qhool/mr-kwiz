import React from 'react';
import { useParams } from 'react-router-dom';

import { AdminShell } from '../../components/admin-shell';
import {
    QuizIntroScreen,
    QuizQuestionScreen,
    QuizResultsScreen,
} from '../../components/quiz-preview';
import { useAdminQuizDefinition } from '../../hooks/useAdminQuizDefinition';
import { buildAdminQuestionEditPrompt } from '../../lib/admin-question-edit-prompt';
import { quizDefinitionSchema, quizEditPatchSchema, type QuizDefinition } from '../../lib/quiz-definition';

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
    | { type: 'question'; questionId: string }
    | { type: 'results' };

const screenButtonStyle = (isActive: boolean): React.CSSProperties => ({
    background: isActive ? '#6a5032' : 'rgba(255, 250, 240, 0.82)',
    border: isActive ? '1px solid #6a5032' : '1px solid #c8bfa9',
    borderRadius: 14,
    color: isActive ? '#f6f0df' : '#3f3220',
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
    const [patchText, setPatchText] = React.useState('');
    const [isPatchBoxOpen, setIsPatchBoxOpen] = React.useState(false);
    const [isSubmittingPatch, setIsSubmittingPatch] = React.useState(false);
    const [message, setMessage] = React.useState<string | null>(null);

    const questionScreens = React.useMemo(() => {
        return definition?.questions.map((question) => ({ type: 'question' as const, questionId: question.id })) ?? [];
    }, [definition]);

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
    }, [definition]);

    React.useEffect(() => {
        if (!definition) {
            return;
        }

        if (selectedScreen.type === 'question') {
            const exists = definition.questions.some((question) => question.id === selectedScreen.questionId);
            if (!exists) {
                setSelectedScreen(definition.questions.length > 0 ? { type: 'question', questionId: definition.questions[0].id } : { type: 'intro' });
            }
        }
    }, [definition, selectedScreen]);

    const scaleMin = definition?.display_config.result_scale_min ?? -1;
    const scaleMax = definition?.display_config.result_scale_max ?? 1;

    const selectedQuestion =
        selectedScreen.type === 'question'
            ? definition?.questions.find((question) => question.id === selectedScreen.questionId) ?? null
            : null;

    const handleCopyQuestionEditPrompt = async () => {
        setError(null);
        setMessage(null);
        setIsPatchBoxOpen(true);

        if (!selectedQuestion) {
            setError('No question is currently selected for editing.');
            return;
        }

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
                selectedQuestion,
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
        <AdminShell adminKey={adminKey} currentPage="preview" metadata={metadata}>
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
                            background: isPatchBoxOpen ? '#4d3b22' : '#6a5032',
                            border: 'none',
                            borderRadius: 999,
                            color: '#f6f0df',
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
                        background: '#fbe9e7',
                        border: '1px solid #d86b47',
                        color: '#6f2412',
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
                        background: '#edf7ed',
                        border: '1px solid #5a8f5a',
                        color: '#1f4f1f',
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
                        background: 'rgba(255, 250, 240, 0.9)',
                        border: '1px solid #c8bfa9',
                        borderRadius: 18,
                        marginBottom: '1.5rem',
                        padding: '1rem',
                    }}
                >
                    <div style={{ alignItems: 'center', display: 'flex', gap: '0.75rem', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                        <div>
                            <h2 style={{ fontSize: '1rem', margin: 0 }}>Paste Patch</h2>
                            <p style={{ color: '#5d4b30', margin: '0.35rem 0 0' }}>
                                Paste a patch returned from chat. Fenced JSON blocks are accepted.
                            </p>
                        </div>
                        <button
                            onClick={() => setIsPatchBoxOpen(false)}
                            style={{
                                background: 'transparent',
                                border: '1px solid #b7ab91',
                                borderRadius: 999,
                                color: '#4a3922',
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
                                border: '1px solid #c8bfa9',
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
                                    background: '#30291f',
                                    border: 'none',
                                    borderRadius: 999,
                                    color: '#f6f0df',
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
                                    background: '#e9dfc8',
                                    border: '1px solid #b7ab91',
                                    borderRadius: 999,
                                    color: '#4a3922',
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
                            background: 'rgba(255, 250, 240, 0.82)',
                            border: '1px solid #c8bfa9',
                            borderRadius: 18,
                            padding: '1rem',
                        }}
                    >
                        <h2 style={{ fontSize: '1rem', margin: '0 0 0.85rem' }}>Preview Screens</h2>
                        <div style={{ display: 'grid', gap: '0.65rem' }}>
                            <button onClick={() => setSelectedScreen({ type: 'intro' })} style={screenButtonStyle(selectedScreen.type === 'intro')} type="button">
                                Intro
                            </button>
                            {questionScreens.map((screen, index) => (
                                <button
                                    key={screen.questionId}
                                    onClick={() => setSelectedScreen(screen)}
                                    style={screenButtonStyle(selectedScreen.type === 'question' && selectedScreen.questionId === screen.questionId)}
                                    type="button"
                                >
                                    Question {index + 1}
                                </button>
                            ))}
                            <button onClick={() => setSelectedScreen({ type: 'results' })} style={screenButtonStyle(selectedScreen.type === 'results')} type="button">
                                Results
                            </button>
                        </div>
                    </div>

                    <div
                        style={{
                            background: 'rgba(255, 250, 240, 0.82)',
                            border: '1px solid #c8bfa9',
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
                                        <label key={trait.id} style={{ display: 'grid', gap: '0.35rem' }}>
                                            <span style={{ color: '#4e3d24', fontSize: '0.92rem', fontWeight: 700 }}>{trait.label}</span>
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
                                            <span style={{ color: '#6b5734', fontSize: '0.84rem' }}>{(previewScores[trait.id] ?? (scaleMin + scaleMax) / 2).toFixed(2)}</span>
                                        </label>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ color: '#6b5734' }}>Define traits before previewing results scores.</div>
                            )
                        ) : (
                            <div style={{ color: '#6b5734' }}>Select the Results screen to adjust preview scores.</div>
                        )}
                    </div>
                </aside>

                <main>
                    {isLoading || !definition ? (
                        <div
                            style={{
                                background: 'rgba(255, 250, 240, 0.82)',
                                border: '1px solid #c8bfa9',
                                borderRadius: 18,
                                padding: '1.5rem',
                            }}
                        >
                            Loading preview...
                        </div>
                    ) : null}

                    {!isLoading && definition && selectedScreen.type === 'question' && selectedQuestion ? (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                            <button
                                onClick={() => {
                                    void handleCopyQuestionEditPrompt();
                                }}
                                style={{
                                    alignItems: 'center',
                                    background: '#6a5032',
                                    border: 'none',
                                    borderRadius: 999,
                                    color: '#f6f0df',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    gap: '0.55rem',
                                    padding: '0.7rem 1rem',
                                }}
                                type="button"
                            >
                                <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
                                    <path d="M4 20h4l10.5-10.5a1.414 1.414 0 0 0 0-2L16.5 5a1.414 1.414 0 0 0-2 0L4 15.5V20Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                                    <path d="m13.5 6 4.5 4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                                </svg>
                                Edit This Question in Chat
                            </button>
                        </div>
                    ) : null}

                    {!isLoading && definition && selectedScreen.type === 'intro' ? <QuizIntroScreen definition={definition} /> : null}
                    {!isLoading && definition && selectedScreen.type === 'question' ? (
                        <QuizQuestionScreen
                            question={selectedQuestion}
                            questionCount={definition.questions.length}
                            questionIndex={Math.max(0, definition.questions.findIndex((question) => question.id === selectedScreen.questionId))}
                        />
                    ) : null}
                    {!isLoading && definition && selectedScreen.type === 'results' ? (
                        <QuizResultsScreen
                            completionMarkdown={definition.display_config.completion_markdown}
                            scaleMax={scaleMax}
                            scaleMin={scaleMin}
                            scores={previewScores}
                            traits={definition.traits}
                        />
                    ) : null}
                </main>
            </div>
        </AdminShell>
    );
};

export default QuizPreviewPage;