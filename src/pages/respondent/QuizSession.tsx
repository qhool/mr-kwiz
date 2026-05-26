import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { QuizIntroScreen, QuizQuestionScreen, QuizResultsScreen } from '../../components/quiz-preview';
import { RespondentAnswersPanel } from '../../components/respondent-answers-panel';
import { RespondentShell } from '../../components/respondent-shell';
import { useRespondentSession } from '../../hooks/useRespondentSession';
import { buildRespondentResultsPrompt } from '../../lib/respondent-results-prompt';
import {
    computeRespondentScores,
    getMostRecentStoredRespondentSession,
    getOrderedActiveQuestions,
    listStoredRespondentSessions,
    touchStoredRespondentSession,
} from '../../lib/respondent-quiz';

const QuizSessionPage: React.FC = () => {
    const navigate = useNavigate();
    const { responseKey } = useParams<{ responseKey: string }>();
    const { definition, error, isLoading, isSubmittingAnswer, session, submitAnswer } = useRespondentSession(responseKey);

    const [copyMessage, setCopyMessage] = React.useState<string | null>(null);
    const [hasStarted, setHasStarted] = React.useState(false);
    const [storedSessions, setStoredSessions] = React.useState(listStoredRespondentSessions());

    React.useEffect(() => {
        if (session?.response.response_key && session.quiz.title) {
            touchStoredRespondentSession(session.response.response_key, session.quiz.title);
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
    const currentQuestion = React.useMemo(() => {
        if (!definition || !session?.response.current_question_id) {
            return null;
        }

        return orderedQuestions.find((question) => question.id === session.response.current_question_id) ?? null;
    }, [definition, orderedQuestions, session]);
    const currentQuestionIndex = currentQuestion
        ? orderedQuestions.findIndex((question) => question.id === currentQuestion.id)
        : -1;
    const scoreSummary = React.useMemo(() => {
        if (!definition || !session) {
            return null;
        }

        return computeRespondentScores(definition, session.answers);
    }, [definition, session]);

    const showIntro = Boolean(session && definition && session.answers.length === 0 && !hasStarted && session.response.state === 'started');
    const showResults = Boolean(
        session &&
            definition &&
            !showIntro &&
            (session.response.state === 'submitted' || session.response.current_question_id === null)
    );

    const handleSelectSession = (nextResponseKey: string) => {
        navigate(`/quiz/${encodeURIComponent(nextResponseKey)}`);
    };

    const handleAnswer = async (answerId: string) => {
        if (!currentQuestion) {
            return;
        }

        setCopyMessage(null);
        await submitAnswer(currentQuestion.id, answerId);
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

    if (!responseKey) {
        return null;
    }

    return (
        <RespondentShell
            currentResponseKey={responseKey}
            onSelectSession={handleSelectSession}
            quizTitle={session?.quiz.title ?? 'Loading quiz...'}
            sessions={storedSessions.length > 0 ? storedSessions : [{ last_interacted_at: new Date().toISOString(), quiz_title: session?.quiz.title ?? 'Current Quiz', response_key: responseKey }]}
        >
            <div style={{ margin: '0 auto', maxWidth: 980 }}>
                {error ? (
                    <div style={{ background: '#fbe9e7', border: '1px solid #d86b47', borderRadius: 16, color: '#6f2412', marginBottom: '1rem', padding: '0.9rem 1rem', whiteSpace: 'pre-wrap' }}>
                        {error}
                    </div>
                ) : null}

                {copyMessage ? (
                    <div style={{ background: '#edf7ed', border: '1px solid #5a8f5a', borderRadius: 16, color: '#1f4f1f', marginBottom: '1rem', padding: '0.9rem 1rem' }}>
                        {copyMessage}
                    </div>
                ) : null}

                {isLoading || !definition || !session ? <div>Loading your quiz...</div> : null}

                {!isLoading && definition && session && showIntro ? (
                    <>
                        <QuizIntroScreen
                            definition={definition}
                            emptyStateMessage="Take a moment to get ready, then start when you are ready."
                            suppressDefaultAdminIntro
                        />
                        <div style={{ marginTop: '1rem' }}>
                            <button
                                onClick={() => setHasStarted(true)}
                                style={{ background: '#6a5032', border: 'none', borderRadius: 999, color: '#f6f0df', cursor: 'pointer', padding: '0.85rem 1.4rem' }}
                                type="button"
                            >
                                Start Quiz
                            </button>
                        </div>
                    </>
                ) : null}

                {!isLoading && definition && session && !showIntro && !showResults ? (
                    <QuizQuestionScreen
                        eyebrow="Your Quiz"
                        onSelectResponse={(answerId) => {
                            void handleAnswer(answerId);
                        }}
                        question={currentQuestion}
                        questionCount={orderedQuestions.length}
                        questionIndex={Math.max(0, currentQuestionIndex)}
                    />
                ) : null}

                {!isLoading && definition && session && showResults && scoreSummary ? (
                    <>
                        <QuizResultsScreen
                            completionMarkdown={definition.display_config.completion_markdown}
                            eyebrow="Your Results"
                            scaleMax={definition.display_config.result_scale_max ?? 1}
                            scaleMin={definition.display_config.result_scale_min ?? -1}
                            scores={scoreSummary.scores}
                            subtitle="Your answered questions have been scored using the quiz's trait matrix."
                            title="Your Results"
                            traits={definition.traits}
                        />
                        <div style={{ marginTop: '1rem' }}>
                            <button
                                onClick={() => {
                                    void handleCopyAiPrompt();
                                }}
                                style={{ background: '#6a5032', border: 'none', borderRadius: 999, color: '#f6f0df', cursor: 'pointer', padding: '0.85rem 1.4rem' }}
                                type="button"
                            >
                                Ask AI about my results
                            </button>
                        </div>
                        <RespondentAnswersPanel answers={session.answers} definition={definition} />
                    </>
                ) : null}

                {isSubmittingAnswer ? <div style={{ color: '#6b5734', marginTop: '1rem' }}>Saving your answer...</div> : null}
            </div>
        </RespondentShell>
    );
};

export default QuizSessionPage;