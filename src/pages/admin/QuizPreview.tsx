import React from 'react';
import { Link, useParams } from 'react-router-dom';

import {
    QuizIntroScreen,
    QuizQuestionScreen,
    QuizResultsScreen,
} from '../../components/quiz-preview';
import { useAdminQuizDefinition } from '../../hooks/useAdminQuizDefinition';

type PreviewScreen =
    | { type: 'intro' }
    | { type: 'question'; questionId: string }
    | { type: 'results' };

const navLinkStyle: React.CSSProperties = {
    background: '#6a5032',
    borderRadius: 999,
    color: '#f6f0df',
    display: 'inline-flex',
    padding: '0.7rem 1.15rem',
    textDecoration: 'none',
};

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

const QuizPreviewPage: React.FC = () => {
    const { adminKey } = useParams<{ adminKey: string }>();
    const { definition, error, isLoading, metadata, setError } = useAdminQuizDefinition(adminKey);

    const [selectedScreen, setSelectedScreen] = React.useState<PreviewScreen>({ type: 'intro' });
    const [previewScores, setPreviewScores] = React.useState<Record<string, number>>({});

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

    return (
        <div style={{ margin: '0 auto', maxWidth: 1400, padding: '2rem 1.5rem' }}>
            <header style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.9rem', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ marginBottom: '0.35rem' }}>Quiz Preview</h1>
                    <p style={{ margin: 0 }}>
                        {metadata
                            ? `${metadata.title} · definition version ${metadata.current_definition_version}`
                            : 'Loading quiz definition...'}
                    </p>
                </div>
                {adminKey ? <Link style={navLinkStyle} to={`/admin/${encodeURIComponent(adminKey)}/edit`}>Back to Edit</Link> : null}
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
        </div>
    );
};

export default QuizPreviewPage;