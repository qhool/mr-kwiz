import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { testDefinition } from '../../lib/__tests__/fixtures';
import { listStoredAdminSessions } from '../../lib/respondent-quiz';
import { useAdminQuizDefinition } from '../useAdminQuizDefinition';

const createJsonResponse = (body: unknown, init?: ResponseInit) => {
    return new Response(JSON.stringify(body), {
        headers: {
            'content-type': 'application/json',
        },
        status: 200,
        ...init,
    });
};

const createAdminDefinitionPayload = () => ({
    definition: testDefinition,
    quiz: {
        current_definition_version: testDefinition.definition_version,
        description: testDefinition.description,
        id: '11111111-1111-4111-8111-111111111111',
        title: testDefinition.title,
    },
});

describe('useAdminQuizDefinition', () => {
    const fetchMock = vi.fn<typeof fetch>();

    beforeEach(() => {
        window.localStorage.clear();
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('loads a quiz definition successfully and stores the admin session', async () => {
        fetchMock.mockResolvedValueOnce(createJsonResponse(createAdminDefinitionPayload()));

        const { result } = renderHook(() => useAdminQuizDefinition('admin-key'));

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(fetchMock).toHaveBeenCalledWith('/api/admin/admin-key/edit');
        expect(result.current.error).toBeNull();
        expect(result.current.definition?.title).toBe(testDefinition.title);
        expect(result.current.metadata).toEqual(createAdminDefinitionPayload().quiz);
        expect(listStoredAdminSessions()).toEqual([
            expect.objectContaining({
                admin_token: 'admin-key',
                quiz_title: testDefinition.title,
            }),
        ]);
    });

    it('reports a missing admin key without calling fetch', async () => {
        const { result } = renderHook(() => useAdminQuizDefinition(undefined));

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.current.error).toBe('Missing admin key.');
        expect(result.current.definition).toBeNull();
        expect(result.current.metadata).toBeNull();
    });

    it('surfaces API errors from a non-ok response body', async () => {
        fetchMock.mockResolvedValueOnce(
            createJsonResponse(
                {
                    error: 'Failed to load quiz definition.',
                },
                { status: 500 }
            )
        );

        const { result } = renderHook(() => useAdminQuizDefinition('admin-key'));

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.error).toBe('Failed to load quiz definition.');
        expect(result.current.definition).toBeNull();
        expect(result.current.metadata).toBeNull();
    });

    it('surfaces Zod parse failures for invalid definition payloads', async () => {
        fetchMock.mockResolvedValueOnce(
            createJsonResponse({
                ...createAdminDefinitionPayload(),
                definition: {
                    ...testDefinition,
                    question_ordering: 'broken-order',
                },
            })
        );

        const { result } = renderHook(() => useAdminQuizDefinition('admin-key'));

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });

        expect(result.current.definition).toBeNull();
        expect(result.current.metadata).toBeNull();
        expect(result.current.error).toContain('Invalid option');
        expect(listStoredAdminSessions()).toEqual([]);
    });
});