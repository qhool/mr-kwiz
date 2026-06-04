import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { QuizIntroScreen, QuizQuestionScreen, QuizResultsScreen } from '../../components/quiz-preview';
import { RespondentAnswersPanel } from '../../components/respondent-answers-panel';
import { RespondentShell } from '../../components/respondent-shell';
import { RespondentViewKeyModal } from '../../components/respondent-view-key-modal';
import { useRespondentSession } from '../../hooks/useRespondentSession';
import { ADAPTIVE_PROGRESS_PHASES } from '../../lib/adaptive-progress-phases';
import {
    computeAdaptiveCompletionPercent,
    findAdaptivePhaseForPercent,
} from '../../lib/adaptive-progress';
import { buildRespondentResultsPrompt } from '../../lib/respondent-results-prompt';
import {
    consumeRespondentIntroSkipped,
    computeRespondentScores,
    getMostRecentStoredRespondentSession,
    getOrderedActiveQuestions,
    getNextRandomQuestionId,
    selectAdaptiveCandidates,
    isAdaptiveQuizComplete,
    getAdaptiveSkippedIds,
    addAdaptiveSkippedId,
    getAdaptiveBatch,
    setAdaptiveBatch,
    clearAdaptiveSessionState,
    listStoredRespondentSessions,
    touchStoredRespondentSession,
} from '../../lib/respondent-quiz';
import { resolveThemeColors } from '../../lib/theme-colors';

const QuizSessionPage: React.FC = () => {
    const navigate = useNavigate();
    const { responseKey } = useParams<{ responseKey: string }>();
    const { definition, error, isLoading, isSubmittingAnswer, session, submitAnswer } = useRespondentSession(responseKey);

    const [copyMessage, setCopyMessage] = React.useState<string | null>(null);
    const [isShareModalOpen, setIsShareModalOpen] = React.useState(false);
    const [skipIntro, setSkipIntro] = React.useState(false);
    const [storedSessions, setStoredSessions] = React.useState(listStoredRespondentSessions());
    // Adaptive/random: client-owned current question id override
    const [clientQuestionId, setClientQuestionId] = React.useState<string | null>(null);
    const [adaptivePhaseId, setAdaptivePhaseId] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!responseKey) {
            setSkipIntro(false);
            return;
        }

        setSkipIntro(consumeRespondentIntroSkipped(responseKey));
    }, [responseKey]);

    // Initialise adaptive batch and client question id when session/definition first loads
    React.useEffect(() => {
        if (!definition || !session || !responseKey) return;
        if ((definition.question_ordering ?? 'ordered') !== 'adaptive') {
            setClientQuestionId(null);
            return;
        }
        const cfg = definition.scoring_config.adaptive_selection;
        if (!cfg) return;
        const existingBatch = getAdaptiveBatch(responseKey);
        if (existingBatch.length > 0) {
            setClientQuestionId(existingBatch[0]?.question_id ?? null);
            return;
        }
        const skipped = getAdaptiveSkippedIds(responseKey);
        const score = computeRespondentScores(definition, session.answers);
        const newBatch = selectAdaptiveCandidates(definition, session.answers, skipped, cfg, score);
        setAdaptiveBatch(responseKey, newBatch);
        setClientQuestionId(newBatch[0]?.question_id ?? null);
    // Run only when session identity changes, not on every session mutation
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [definition?.question_ordering, session?.response.response_key]);

    React.useEffect(() => {
        if (session?.response.response_key && session.quiz.title) {
            const isSubmitted = session.response.state === 'submitted' && session.response.submitted_at;
            touchStoredRespondentSession(
                session.response.response_key,
                session.quiz.title,
                isSubmitted ? session.response.submitted_at : null
            );
            setStoredSessions(listStoredRespondentSessions());
        }
    }, [session]);

    React.useEffect(() => {
        if (!responseKey) {
            const mostRecent = getMostRecentStoredRespondentSession();
            if (mostRecent) {
                navigate(`/quiz/${encodeURIComponent(mostRecent.response_key)}`, { replace: true });
            }
        }
    }, [navigate, responseKey]);

    const orderedQuestions = React.useMemo(
        () => (definition ? getOrderedActiveQuestions(definition) : []),
        [definition]
    );

    // Compute an effective next question id via mode-aware selection
    const effectiveQuestionId = React.useMemo((): string | null => {
        if (!definition || !session) return session?.response.current_question_id ?? null;
        const ordering = definition.question_ordering ?? 'ordered';
        if (ordering === 'ordered') return clientQuestionId ?? session.response.current_question_id;
        if (ordering === 'random') {
            return clientQuestionId ?? getNextRandomQuestionId(definition, session.answers, session.response.response_key);
        }
        // adaptive: use client batch
        return clientQuestionId ?? session.response.current_question_id;
    }, [definition, session, clientQuestionId]);

    const currentQuestion = React.useMemo(() => {
        if (!definition || !effectiveQuestionId) return null;
        return orderedQuestions.find((q) => q.id === effectiveQuestionId) ?? null;
    }, [definition, orderedQuestions, effectiveQuestionId]);
    const currentQuestionIndex = currentQuestion
        ? orderedQuestions.findIndex((question) => question.id === currentQuestion.id)
        : -1;
    const ordering = definition?.question_ordering ?? 'ordered';
    const answeredCount = session?.answers.length ?? 0;

    const progressPercent = React.useMemo(() => {
        if (!definition || !session) {
            return 0;
        }

        if (ordering === 'adaptive') {
            return computeAdaptiveCompletionPercent(definition, session.answers);
        }

        const total = Math.max(1, orderedQuestions.length);
        return Math.max(0, Math.min(100, (answeredCount / total) * 100));
    }, [answeredCount, definition, ordering, orderedQuestions.length, session]);

    const progressLabel = React.useMemo(() => {
        if (!definition || !session) {
            return 'Question 0 of 0';
        }

        if (ordering === 'adaptive') {
            return 'Adaptive progress';
        }

        const total = orderedQuestions.length;
        const n = total > 0 ? Math.min(answeredCount + 1, total) : 0;
        return `Question ${n} of ${total}`;
    }, [answeredCount, definition, ordering, orderedQuestions.length, progressPercent, session]);

    const progressTooltip = React.useMemo(() => {
        if (!definition || !session || ordering !== 'adaptive') {
            return undefined;
        }

        const cfg = definition.scoring_config.adaptive_selection;
        const minQuestions = cfg?.min_questions ?? 0;
        const maxQuestions = cfg?.max_questions ?? minQuestions;
        return `Adaptive progress ${Math.round(progressPercent)}% (${answeredCount} answered, min ${minQuestions}, max ${maxQuestions})`;
    }, [answeredCount, definition, ordering, progressPercent, session]);

    const currentAdaptivePhase = React.useMemo(() => {
        if (ordering !== 'adaptive') {
            return null;
        }

        const byId = adaptivePhaseId
            ? ADAPTIVE_PROGRESS_PHASES.find((phase) => phase.id === adaptivePhaseId)
            : null;
        if (byId) {
            return byId;
        }

        return findAdaptivePhaseForPercent(ADAPTIVE_PROGRESS_PHASES, 0);
    }, [adaptivePhaseId, ordering]);

    React.useEffect(() => {
        if (ordering !== 'adaptive') {
            setAdaptivePhaseId(null);
            return;
        }

        const initial = findAdaptivePhaseForPercent(
            ADAPTIVE_PROGRESS_PHASES,
            answeredCount === 0 ? 0 : progressPercent
        );
        if (!adaptivePhaseId && initial) {
            setAdaptivePhaseId(initial.id);
            return;
        }

        const currentPhase = adaptivePhaseId
            ? ADAPTIVE_PROGRESS_PHASES.find((phase) => phase.id === adaptivePhaseId)
            : null;
        if (!currentPhase) {
            return;
        }

        // Phase message advances only when current range upper bound is reached.
        if (progressPercent >= currentPhase.maxPercent) {
            const next = findAdaptivePhaseForPercent(ADAPTIVE_PROGRESS_PHASES, progressPercent);
            if (next && next.id !== currentPhase.id) {
                setAdaptivePhaseId(next.id);
            }
        }
    }, [adaptivePhaseId, answeredCount, ordering, progressPercent]);

    const progressMessage = ordering === 'adaptive' ? currentAdaptivePhase?.message : undefined;
    const currentSessionUrl = responseKey ? `${window.location.origin}/quiz/${encodeURIComponent(responseKey)}` : '';

    const scoreSummary = React.useMemo(() => {
        if (!definition || !session) {
            return null;
        }

        return computeRespondentScores(definition, session.answers);
    }, [definition, session]);

    const showIntro = false;
    const showResults = Boolean(
        session &&
            definition &&
            !showIntro &&
            (() => {
                if (session.response.state === 'submitted') return true;
                if (ordering === 'adaptive') {
                    const cfg = definition?.scoring_config.adaptive_selection;
                    if (cfg && scoreSummary) {
                        const batch = responseKey ? getAdaptiveBatch(responseKey) : [];
                        return isAdaptiveQuizComplete(definition, session.answers, batch);
                    }
                }
                return effectiveQuestionId === null;
            })()
    );

    const handleSelectSession = (nextResponseKey: string) => {
        navigate(`/quiz/${encodeURIComponent(nextResponseKey)}`);
    };

    const resolvedTheme = React.useMemo(
        () => resolveThemeColors(definition?.display_config.theme_colors),
        [definition?.display_config.theme_colors]
    );

    const handleAnswer = async (answerId: string) => {
        if (!currentQuestion) {
            return;
        }

        setCopyMessage(null);
        const newSession = await submitAnswer(currentQuestion.id, answerId);

        // After answer, recompute client next question for non-ordered modes
        if (newSession && definition && responseKey) {
            const ordering = definition.question_ordering ?? 'ordered';
            if (ordering === 'random') {
                setClientQuestionId(getNextRandomQuestionId(definition, newSession.answers, responseKey));
            } else if (ordering === 'adaptive') {
                const cfg = definition.scoring_config.adaptive_selection;
                if (cfg) {
                    const newScore = computeRespondentScores(definition, newSession.answers);
                    const skipped = getAdaptiveSkippedIds(responseKey);
                    const newBatch = selectAdaptiveCandidates(definition, newSession.answers, skipped, cfg, newScore);
                    setAdaptiveBatch(responseKey, newBatch);
                    const done = isAdaptiveQuizComplete(definition, newSession.answers, newBatch);
                    if (done) {
                        clearAdaptiveSessionState(responseKey);
                        setClientQuestionId(null);
                    } else {
                        setClientQuestionId(newBatch[0]?.question_id ?? null);
                    }
                }
            } else {
                setClientQuestionId(null);
            }
        }
    };

    const handleSkip = () => {
        if (!currentQuestion || !definition || !responseKey || !session) {
            return;
        }
        const ordering = definition.question_ordering ?? 'ordered';
        if (ordering !== 'adaptive') return;
        const cfg = definition.scoring_config.adaptive_selection;
        if (!cfg) return;

        addAdaptiveSkippedId(responseKey, currentQuestion.id);
        const currentBatch = getAdaptiveBatch(responseKey);
        const nextInBatch = currentBatch.find((c) => c.question_id !== currentQuestion.id);
        if (nextInBatch) {
            // Serve next candidate from existing batch
            setAdaptiveBatch(responseKey, currentBatch.filter((c) => c.question_id !== currentQuestion.id));
            setClientQuestionId(nextInBatch.question_id);
        } else {
            // Batch exhausted — recompute
            const skipped = getAdaptiveSkippedIds(responseKey);
            const newScore = computeRespondentScores(definition, session.answers);
            const newBatch = selectAdaptiveCandidates(definition, session.answers, skipped, cfg, newScore);
            setAdaptiveBatch(responseKey, newBatch);
            setClientQuestionId(newBatch[0]?.question_id ?? null);
        }
    };

    const handleCopyAiPrompt = async () => {
        if (!definition || !session) {
            return;
        }

        if (!navigator.clipboard?.writeText) {
            setCopyMessage('Clipboard API is not available in this browser context.');
            return;
        }

        try {
            await navigator.clipboard.writeText(buildRespondentResultsPrompt(definition, session.answers));
            setCopyMessage('Copied AI results prompt to clipboard.');
        } catch (error) {
            setCopyMessage(error instanceof Error ? error.message : 'Failed to copy AI results prompt.');
        }
    };

    const handleCopySessionLink = async () => {
        if (!currentSessionUrl) {
            return;
        }

        if (!navigator.clipboard?.writeText) {
            setCopyMessage('Clipboard API is not available in this browser context.');
            return;
        }

        try {
            await navigator.clipboard.writeText(currentSessionUrl);
            setCopyMessage('Copied resume link to clipboard.');
        } catch (error) {
            setCopyMessage(error instanceof Error ? error.message : 'Failed to copy resume link.');
        }
    };

    if (!responseKey) {
        return null;
    }

    return (
        <RespondentShell
            currentResponseKey={responseKey}
            onSelectSession={handleSelectSession}
            themeColors={resolvedTheme}
            quizTitle={session?.quiz.title ?? 'Loading quiz...'}
            sessions={storedSessions.length > 0 ? storedSessions : [{ last_interacted_at: new Date().toISOString(), quiz_title: session?.quiz.title ?? 'Current Quiz', response_key: responseKey, submitted_at: null }]}
        >
            {/* Sticky messaging area at top */}
            <div style={{ position: 'sticky', top: 0, zIndex: 100, marginBottom: '1rem' }}>
                {error ? (
                    <div style={{ background: '#fbe9e7', border: '1px solid #d86b47', borderRadius: 16, color: '#6f2412', padding: '0.9rem 1rem', whiteSpace: 'pre-wrap' }}>
                        {error}
                    </div>
                ) : null}

                {copyMessage ? (
                    <div style={{ background: '#edf7ed', border: '1px solid #5a8f5a', borderRadius: 16, color: '#1f4f1f', padding: '0.9rem 1rem', marginTop: error ? '0.5rem' : 0 }}>
                        {copyMessage}
                    </div>
                ) : null}
            </div>

            <div style={{ margin: '0 auto', maxWidth: 980 }}>

                {isLoading || !definition || !session ? <div>Loading your quiz...</div> : null}

                {!isLoading && definition && session && !showIntro && !showResults ? (
                    <>
                        <QuizQuestionScreen
                            eyebrow="Your Quiz"
                            onSelectResponse={(answerId) => {
                                void handleAnswer(answerId);
                            }}
                            progressLabel={progressLabel}
                            progressPhraseOnly={(definition.question_ordering ?? 'ordered') === 'adaptive'}
                            progressMessage={progressMessage}
                            progressPercent={progressPercent}
                            progressTooltip={progressTooltip}
                            question={currentQuestion}
                            questionCount={orderedQuestions.length}
                            questionIndex={Math.max(0, currentQuestionIndex)}
                            themeColors={definition.display_config.theme_colors}
                        />
                        {(definition.question_ordering ?? 'ordered') === 'adaptive' ? (
                            <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
                                <button
                                    disabled={isSubmittingAnswer}
                                    onClick={handleSkip}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid #c8bfa9',
                                        borderRadius: 999,
                                        color: '#7a6548',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        padding: '0.5rem 1rem',
                                    }}
                                    type="button"
                                >
                                    Skip this question
                                </button>
                            </div>
                        ) : null}

                        <div style={{ marginTop: '1.35rem' }}>
                            <div style={{ color: '#6b5734', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.55rem', textTransform: 'uppercase' }}>
                                Use this link to resume on another device
                            </div>
                            <div style={{ alignItems: 'center', display: 'flex', gap: '0.6rem' }}>
                                <input
                                    readOnly
                                    value={currentSessionUrl}
                                    style={{
                                        background: '#fcfbf8',
                                        border: '1px solid #c8bfa9',
                                        borderRadius: 12,
                                        color: '#241d14',
                                        flex: 1,
                                        minWidth: 0,
                                        padding: '0.75rem 0.9rem',
                                    }}
                                />
                                <button
                                    onClick={() => {
                                        void handleCopySessionLink();
                                    }}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid #245a78',
                                        borderRadius: 999,
                                        color: '#245a78',
                                        cursor: 'pointer',
                                        fontWeight: 700,
                                        padding: '0.65rem 1rem',
                                        whiteSpace: 'nowrap',
                                    }}
                                    type="button"
                                >
                                    Copy
                                </button>
                            </div>
                        </div>
                    </>
                ) : null}

                {!isLoading && definition && session && showResults && scoreSummary ? (
                    <>
                        <QuizResultsScreen
                            archetypeNameTemplate={definition.display_config.archetype_name_template}
                            completionMarkdown={definition.display_config.completion_markdown}
                            eyebrow="Your Results"
                            scaleMax={definition.display_config.result_scale_max ?? 1}
                            scaleMin={definition.display_config.result_scale_min ?? -1}
                            scores={scoreSummary.scores}
                            selectedArchetype={scoreSummary.selectedArchetype}
                            subtitle="Your answered questions have been scored using the quiz's trait matrix."
                            themeColors={definition.display_config.theme_colors}
                            title="Your Results"
                            traits={definition.traits}
                            traitStats={scoreSummary.traitStats}
                            traitPolarity={definition.display_config.trait_polarity}
                        />
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                            <button
                                onClick={() => {
                                    setIsShareModalOpen(true);
                                }}
                                style={{
                                    background: resolvedTheme.accent,
                                    border: 'none',
                                    borderRadius: 999,
                                    color: resolvedTheme.accent_text,
                                    cursor: 'pointer',
                                    padding: '0.85rem 1.4rem',
                                }}
                                type="button"
                            >
                                Share Results
                            </button>
                            <button
                                onClick={() => {
                                    void handleCopyAiPrompt();
                                }}
                                style={{ background: resolvedTheme.accent, border: 'none', borderRadius: 999, color: resolvedTheme.accent_text, cursor: 'pointer', padding: '0.85rem 1.4rem' }}
                                type="button"
                            >
                                Ask AI about my results
                            </button>
                        </div>
                        <RespondentAnswersPanel answers={session.answers} definition={definition} themeColors={definition.display_config.theme_colors} />
                    </>
                ) : null}

                {isSubmittingAnswer ? <div style={{ color: resolvedTheme.muted_text, marginTop: '1rem' }}>Saving your answer...</div> : null}
            </div>

            {session ? (
                <RespondentViewKeyModal
                    isOpen={isShareModalOpen}
                    onClose={() => setIsShareModalOpen(false)}
                    responseKey={session.response.response_key}
                    themeColors={definition?.display_config.theme_colors}
                />
            ) : null}
        </RespondentShell>
    );
};

export default QuizSessionPage;
