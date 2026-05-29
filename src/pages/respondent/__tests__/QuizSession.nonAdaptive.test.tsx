import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { testDefinition } from '../../../lib/__tests__/fixtures';
import {
    getNextRandomQuestionId,
    type RespondentSession,
} from '../../../lib/respondent-quiz';
import QuizSessionPage from '../QuizSession';

vi.mock('../../../components/respondent-shell', () => ({
    RespondentShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../components/respondent-answers-panel', () => ({
    RespondentAnswersPanel: () => <div>Answers Panel</div>,
}));

vi.mock('../../../components/respondent-view-key-modal', () => ({
    RespondentViewKeyModal: () => null,
}));

vi.mock('../../../components/quiz-preview', () => ({
    QuizIntroScreen: () => <div>Intro Screen</div>,
    QuizResultsScreen: ({ title }: { title: string }) => <div>{title}</div>,
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

type Deferred<T> = {
    promise: Promise<T>;
    reject: (reason?: unknown) => void;
    resolve: (value: T | PromiseLike<T>) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
    let resolve!: Deferred<T>['resolve'];
    let reject!: Deferred<T>['reject'];
    const promise = new Promise<T>((innerResolve, innerReject) => {
        resolve = innerResolve;
        reject = innerReject;
    });

    return { promise, reject, resolve };
};

const createJsonResponse = (body: unknown, init?: ResponseInit) => {
    return new Response(JSON.stringify(body), {
        headers: {
            'content-type': 'application/json',
        },
        status: 200,
        ...init,
    });
};

const createDefinition = (questionOrdering: 'ordered' | 'random') => ({
    ...testDefinition,
    question_ordering: questionOrdering,
});

const createSessionPayload = (
    definition: ReturnType<typeof createDefinition>,
    overrides?: Partial<RespondentSession>
): RespondentSession => ({
    answers: [],
    quiz: {
        description: definition.description,
        id: '11111111-1111-4111-8111-111111111111',
        title: definition.title,
    },
    response: {
        current_question_id: 'q01',
        id: '22222222-2222-4222-8222-222222222222',
        response_key: 'resp-key',
        started_at: '2026-05-29T12:00:00.000Z',
        state: 'started',
        submitted_at: null,
        ...overrides?.response,
    },
    snapshot: {
        definition,
        definition_version: definition.definition_version,
        id: '33333333-3333-4333-8333-333333333333',
        ...overrides?.snapshot,
    },
    ...overrides,
});

describe('QuizSessionPage non-adaptive flows', () => {
    const fetchMock = vi.fn<typeof fetch>();

    beforeEach(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('shows a loading state while the session fetch is pending', async () => {
        const deferred = createDeferred<Response>();
        fetchMock.mockReturnValueOnce(deferred.promise as ReturnType<typeof fetch>);

        render(
            <MemoryRouter initialEntries={['/quiz/resp-key']}>
                <Routes>
                    <Route path="/quiz/:responseKey" element={<QuizSessionPage />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        expect(screen.getByText('Loading your quiz...')).toBeTruthy();

        deferred.resolve(createJsonResponse(createSessionPayload(createDefinition('ordered'))));

        await waitFor(() => {
            expect(screen.queryByText('Loading your quiz...')).toBeNull();
        });
    });

    it('advances through ordered questions after answering', async () => {
        const definition = createDefinition('ordered');
        const updatedSession = createSessionPayload(definition, {
            answers: [
                {
                    answer_id: 'q01-r1',
                    answered_at: '2026-05-29T12:00:10.000Z',
                    question_id: 'q01',
                },
            ],
            response: {
                current_question_id: 'q02',
                id: '22222222-2222-4222-8222-222222222222',
                response_key: 'resp-key',
                started_at: '2026-05-29T12:00:00.000Z',
                state: 'started',
                submitted_at: null,
            },
        });

        fetchMock.mockResolvedValueOnce(createJsonResponse(createSessionPayload(definition)));
        fetchMock.mockResolvedValueOnce(createJsonResponse(updatedSession));

        render(
            <MemoryRouter initialEntries={['/quiz/resp-key']}>
                <Routes>
                    <Route path="/quiz/:responseKey" element={<QuizSessionPage />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByTestId('question-prompt').textContent).toBe('Prompt q01');
        });

        fireEvent.click(screen.getByRole('button', { name: 'Response 1' }));

        await waitFor(() => {
            expect(screen.getByTestId('question-prompt').textContent).toBe('Prompt q02');
        });

        expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/respondent/response/resp-key/answer', {
            body: JSON.stringify({
                answer_id: 'q01-r1',
                question_id: 'q01',
            }),
            headers: {
                'content-type': 'application/json',
            },
            method: 'POST',
        });
    });

    it('advances through the deterministic random order after answering', async () => {
        const definition = createDefinition('random');
        const firstQuestionId = getNextRandomQuestionId(definition, [], 'resp-key');
        const secondQuestionId = getNextRandomQuestionId(
            definition,
            [
                {
                    answer_id: `${firstQuestionId}-r1`,
                    answered_at: '2026-05-29T12:00:10.000Z',
                    question_id: firstQuestionId as string,
                },
            ],
            'resp-key'
        );

        fetchMock.mockResolvedValueOnce(
            createJsonResponse(
                createSessionPayload(definition, {
                    response: {
                        current_question_id: firstQuestionId,
                        id: '22222222-2222-4222-8222-222222222222',
                        response_key: 'resp-key',
                        started_at: '2026-05-29T12:00:00.000Z',
                        state: 'started',
                        submitted_at: null,
                    },
                })
            )
        );
        fetchMock.mockResolvedValueOnce(
            createJsonResponse(
                createSessionPayload(definition, {
                    answers: [
                        {
                            answer_id: `${firstQuestionId}-r1`,
                            answered_at: '2026-05-29T12:00:10.000Z',
                            question_id: firstQuestionId as string,
                        },
                    ],
                    response: {
                        current_question_id: secondQuestionId,
                        id: '22222222-2222-4222-8222-222222222222',
                        response_key: 'resp-key',
                        started_at: '2026-05-29T12:00:00.000Z',
                        state: 'started',
                        submitted_at: null,
                    },
                })
            )
        );

        render(
            <MemoryRouter initialEntries={['/quiz/resp-key']}>
                <Routes>
                    <Route path="/quiz/:responseKey" element={<QuizSessionPage />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByTestId('question-prompt').textContent).toBe(
                definition.questions.find((question) => question.id === firstQuestionId)?.prompt
            );
        });

        fireEvent.click(screen.getByRole('button', { name: 'Response 1' }));

        await waitFor(() => {
            expect(screen.getByTestId('question-prompt').textContent).toBe(
                definition.questions.find((question) => question.id === secondQuestionId)?.prompt
            );
        });
    });

    it('renders the results screen once the submitted session is loaded', async () => {
        fetchMock.mockResolvedValueOnce(
            createJsonResponse(
                createSessionPayload(createDefinition('ordered'), {
                    response: {
                        current_question_id: null,
                        id: '22222222-2222-4222-8222-222222222222',
                        response_key: 'resp-key',
                        started_at: '2026-05-29T12:00:00.000Z',
                        state: 'submitted',
                        submitted_at: '2026-05-29T12:10:00.000Z',
                    },
                })
            )
        );

        render(
            <MemoryRouter initialEntries={['/quiz/resp-key']}>
                <Routes>
                    <Route path="/quiz/:responseKey" element={<QuizSessionPage />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Your Results')).toBeTruthy();
        });
        expect(screen.getByText('Answers Panel')).toBeTruthy();
    });
});