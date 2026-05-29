import { renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { testDefinition } from '../../lib/__tests__/fixtures';
import type { RespondentSession } from '../../lib/respondent-quiz';
import { useRespondentSession } from '../useRespondentSession';

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

const createSessionPayload = (): RespondentSession => ({
    answers: [],
    quiz: {
        description: '',
        id: '11111111-1111-4111-8111-111111111111',
        title: testDefinition.title,
    },
    response: {
        current_question_id: 'q01',
        id: '22222222-2222-4222-8222-222222222222',
        response_key: 'resp-key',
        started_at: '2026-05-29T12:00:00.000Z',
        state: 'started',
        submitted_at: null,
    },
    snapshot: {
        definition: testDefinition,
        definition_version: testDefinition.definition_version,
        id: '33333333-3333-4333-8333-333333333333',
    },
});

describe('useRespondentSession', () => {
    const fetchMock = vi.fn<typeof fetch>();

    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('loads a respondent session successfully', async () => {
        const session = createSessionPayload();
        fetchMock.mockResolvedValueOnce(createJsonResponse(session));

        const { result } = renderHook(() => useRespondentSession('resp-key'));

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(fetchMock).toHaveBeenCalledWith('/api/respondent/response/resp-key');
        expect(result.current.error).toBeNull();
        expect(result.current.definition?.title).toBe(testDefinition.title);
        expect(result.current.session).toEqual(session);
    });

    it('stays in a loading state while the initial fetch is pending', async () => {
        const deferred = createDeferred<Response>();
        fetchMock.mockReturnValueOnce(deferred.promise as ReturnType<typeof fetch>);

        const { result } = renderHook(() => useRespondentSession('resp-key'));

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        expect(result.current.isLoading).toBe(true);
        expect(result.current.session).toBeNull();

        deferred.resolve(createJsonResponse(createSessionPayload()));

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
    });

    it('surfaces a parse error when the API returns an invalid session payload', async () => {
        const invalidPayload = {
            ...createSessionPayload(),
            snapshot: {
                definition: {
                    title: 'Broken definition',
                },
                definition_version: 1,
                id: '33333333-3333-4333-8333-333333333333',
            },
        };
        fetchMock.mockResolvedValueOnce(createJsonResponse(invalidPayload));

        const { result } = renderHook(() => useRespondentSession('resp-key'));

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.session).toBeNull();
        expect(result.current.definition).toBeNull();
        expect(result.current.error).toContain('schema_version');
    });

    it('surfaces submitAnswer network failures and clears the submitting state', async () => {
        fetchMock.mockResolvedValueOnce(createJsonResponse(createSessionPayload()));

        const { result } = renderHook(() => useRespondentSession('resp-key'));

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        fetchMock.mockRejectedValueOnce(new Error('Network down.'));

        let submitPromise!: Promise<RespondentSession>;
        act(() => {
            submitPromise = result.current.submitAnswer('q01', 'q01-r2');
        });

        expect(result.current.isSubmittingAnswer).toBe(true);
        await expect(submitPromise).rejects.toThrow('Network down.');
        await waitFor(() => {
            expect(result.current.isSubmittingAnswer).toBe(false);
        });
        expect(result.current.error).toBe('Network down.');
    });

    it('surfaces 409 submit conflicts and clears the submitting state', async () => {
        fetchMock.mockResolvedValueOnce(createJsonResponse(createSessionPayload()));

        const { result } = renderHook(() => useRespondentSession('resp-key'));

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        fetchMock.mockResolvedValueOnce(
            createJsonResponse(
                {
                    error: 'Definition version conflict.',
                },
                { status: 409 }
            )
        );

        let submitPromise!: Promise<RespondentSession>;
        act(() => {
            submitPromise = result.current.submitAnswer('q01', 'q01-r2');
        });

        expect(result.current.isSubmittingAnswer).toBe(true);
        await expect(submitPromise).rejects.toThrow('Definition version conflict.');
        await waitFor(() => {
            expect(result.current.isSubmittingAnswer).toBe(false);
        });

        expect(fetchMock).toHaveBeenLastCalledWith('/api/respondent/response/resp-key/answer', {
            body: JSON.stringify({
                answer_id: 'q01-r2',
                question_id: 'q01',
            }),
            headers: {
                'content-type': 'application/json',
            },
            method: 'POST',
        });
        expect(result.current.error).toBe('Definition version conflict.');
    });
});