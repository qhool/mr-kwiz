import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeAnswers, testDefinition } from '../../../lib/__tests__/fixtures';
import type { RespondentSession } from '../../../lib/respondent-quiz';

const routerMocks = vi.hoisted(() => ({
    navigate: vi.fn(),
}));

const hookMocks = vi.hoisted(() => ({
    useRespondentSession: vi.fn(),
}));

const respondentQuizMocks = vi.hoisted(() => ({
    consumeRespondentIntroSkipped: vi.fn(() => true),
    getMostRecentStoredRespondentSession: vi.fn(() => null),
    isAdaptiveQuizComplete: vi.fn(() => false),
    listStoredRespondentSessions: vi.fn(() => []),
    selectAdaptiveCandidates: vi.fn(),
    touchStoredRespondentSession: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
    useNavigate: () => routerMocks.navigate,
    useParams: () => ({ responseKey: 'resp-key' }),
}));

vi.mock('../../../hooks/useRespondentSession', () => ({
    useRespondentSession: hookMocks.useRespondentSession,
}));

vi.mock('../../../components/respondent-shell', () => ({
    RespondentShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../components/respondent-answers-panel', () => ({
    RespondentAnswersPanel: () => null,
}));

vi.mock('../../../components/respondent-view-key-modal', () => ({
    RespondentViewKeyModal: () => null,
}));

vi.mock('../../../components/quiz-preview', () => ({
    QuizIntroScreen: () => <div>Intro</div>,
    QuizResultsScreen: () => <div>Results</div>,
    QuizQuestionScreen: ({ onSelectResponse, question }: { onSelectResponse?: (responseId: string) => void; question: (typeof testDefinition.questions)[number] | null }) => {
        if (!question) {
            return <div>No question</div>;
        }

        return (
            <div>
                <div data-testid="question-prompt">{question.prompt}</div>
                {question.responses.map((response) => (
                    <button key={response.id} onClick={() => onSelectResponse?.(response.id)} type="button">
                        {response.label}
                    </button>
                ))}
            </div>
        );
    },
}));

vi.mock('../../../lib/respondent-quiz', async () => {
    const actual = await vi.importActual<typeof import('../../../lib/respondent-quiz')>('../../../lib/respondent-quiz');

    return {
        ...actual,
        consumeRespondentIntroSkipped: respondentQuizMocks.consumeRespondentIntroSkipped,
        getMostRecentStoredRespondentSession: respondentQuizMocks.getMostRecentStoredRespondentSession,
        isAdaptiveQuizComplete: respondentQuizMocks.isAdaptiveQuizComplete,
        listStoredRespondentSessions: respondentQuizMocks.listStoredRespondentSessions,
        selectAdaptiveCandidates: respondentQuizMocks.selectAdaptiveCandidates,
        touchStoredRespondentSession: respondentQuizMocks.touchStoredRespondentSession,
    };
});

import QuizSessionPage from '../QuizSession';
import {
    getAdaptiveBatch,
    getAdaptiveSkippedIds,
    type AdaptiveCandidate,
} from '../../../lib/respondent-quiz';

const makeCandidate = (questionId: string): AdaptiveCandidate => ({
    question_id: questionId,
    expected_info: [1, 0, 0],
    axis_purity: 1,
    need_aligned_gain: 1,
    off_axis_penalty: 0,
    recent_redundancy_penalty: 0,
    skipped_penalty: 0,
    batch_diversity_penalty: 0,
    raw_adaptive_score: 1,
    adaptive_goodness: 0.9,
    top_target_traits: ['trait-a'],
});

const makeSession = (answers = makeAnswers([])): RespondentSession => ({
    answers,
    quiz: {
        description: '',
        id: '11111111-1111-1111-1111-111111111111',
        title: testDefinition.title,
    },
    response: {
        current_question_id: 'q01',
        id: '22222222-2222-2222-2222-222222222222',
        response_key: 'resp-key',
        started_at: '2026-05-27T12:00:00.000Z',
        state: 'started',
        submitted_at: null,
    },
    snapshot: {
        definition: testDefinition,
        definition_version: testDefinition.definition_version,
        id: '33333333-3333-3333-3333-333333333333',
    },
});

describe('QuizSession adaptive orchestration', () => {
    let currentSession: RespondentSession;
    let submitAnswer: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        window.sessionStorage.clear();
        vi.clearAllMocks();

        currentSession = makeSession();
        submitAnswer = vi.fn(async (questionId: string, answerId: string) => {
            currentSession = makeSession([
                ...currentSession.answers,
                {
                    answer_id: answerId,
                    answered_at: '2026-05-27T12:00:01.000Z',
                    question_id: questionId,
                },
            ]);

            return currentSession;
        });

        hookMocks.useRespondentSession.mockImplementation(() => ({
            definition: testDefinition,
            error: null,
            isLoading: false,
            isSubmittingAnswer: false,
            loadSession: vi.fn(),
            session: currentSession,
            setError: vi.fn(),
            submitAnswer,
        }));
    });

    afterEach(() => {
        cleanup();
    });

    it('advances within the current adaptive batch on skip, then recomputes when the batch is exhausted', async () => {
        respondentQuizMocks.selectAdaptiveCandidates.mockImplementation(
            (_definition, _answers, skippedIds: Set<string>) => {
                if (skippedIds.has('q02')) {
                    return [makeCandidate('q03'), makeCandidate('q04')];
                }

                return [makeCandidate('q01'), makeCandidate('q02')];
            }
        );

        render(<QuizSessionPage />);

        await waitFor(() => {
            expect(screen.getByTestId('question-prompt').textContent).toBe('Prompt q01');
        });

        fireEvent.click(screen.getByRole('button', { name: 'Skip this question' }));

        await waitFor(() => {
            expect(screen.getByTestId('question-prompt').textContent).toBe('Prompt q02');
        });
        expect([...getAdaptiveSkippedIds('resp-key')].sort()).toEqual(['q01']);
        expect(getAdaptiveBatch('resp-key').map((candidate) => candidate.question_id)).toEqual(['q02']);

        fireEvent.click(screen.getByRole('button', { name: 'Skip this question' }));

        await waitFor(() => {
            expect(screen.getByTestId('question-prompt').textContent).toBe('Prompt q03');
        });
        expect([...getAdaptiveSkippedIds('resp-key')].sort()).toEqual(['q01', 'q02']);
        expect(getAdaptiveBatch('resp-key').map((candidate) => candidate.question_id)).toEqual(['q03', 'q04']);
    });

    it('recomputes the adaptive batch after answering and advances to the new top candidate', async () => {
        respondentQuizMocks.selectAdaptiveCandidates.mockImplementation(
            (_definition, answers) => (answers.length > 0 ? [makeCandidate('q05'), makeCandidate('q06')] : [makeCandidate('q01'), makeCandidate('q02')])
        );

        render(<QuizSessionPage />);

        await waitFor(() => {
            expect(screen.getByTestId('question-prompt').textContent).toBe('Prompt q01');
        });

        fireEvent.click(screen.getByRole('button', { name: 'Response 1' }));

        await waitFor(() => {
            expect(submitAnswer).toHaveBeenCalledWith('q01', 'q01-r1');
        });
        await waitFor(() => {
            expect(screen.getByTestId('question-prompt').textContent).toBe('Prompt q05');
        });
        expect(getAdaptiveBatch('resp-key').map((candidate) => candidate.question_id)).toEqual(['q05', 'q06']);
    });

    it('clears adaptive session state when recomputation determines the quiz is complete', async () => {
        respondentQuizMocks.selectAdaptiveCandidates.mockImplementation(
            (_definition, answers) => (answers.length > 0 ? [makeCandidate('q05')] : [makeCandidate('q01'), makeCandidate('q02')])
        );
        respondentQuizMocks.isAdaptiveQuizComplete.mockImplementation((_definition, answers) => answers.length > 0);

        render(<QuizSessionPage />);

        await waitFor(() => {
            expect(screen.getByTestId('question-prompt').textContent).toBe('Prompt q01');
        });

        fireEvent.click(screen.getByRole('button', { name: 'Response 1' }));

        await waitFor(() => {
            expect(screen.getByText('Results')).toBeTruthy();
        });
        expect(getAdaptiveSkippedIds('resp-key').size).toBe(0);
        expect(getAdaptiveBatch('resp-key')).toEqual([]);
    });
});