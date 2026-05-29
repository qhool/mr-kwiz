import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { testDefinition } from '../../../lib/__tests__/fixtures';
import type { RespondentSession } from '../../../lib/respondent-quiz';
import ViewResultsPage from '../ViewResults';

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
        current_question_id: null,
        id: '22222222-2222-4222-8222-222222222222',
        response_key: 'resp-key',
        started_at: '2026-05-29T12:00:00.000Z',
        state: 'submitted',
        submitted_at: '2026-05-29T12:10:00.000Z',
    },
    snapshot: {
        definition: testDefinition,
        definition_version: testDefinition.definition_version,
        id: '33333333-3333-4333-8333-333333333333',
    },
});

describe('ViewResultsPage', () => {
    const fetchMock = vi.fn<typeof fetch>();

    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('renders shared results for a valid view key', async () => {
        fetchMock.mockResolvedValueOnce(createJsonResponse(createSessionPayload()));

        render(
            <MemoryRouter initialEntries={['/view/view-key']}>
                <Routes>
                    <Route path="/view/:viewKey" element={<ViewResultsPage />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Shared Results')).toBeTruthy();
        });

        expect(fetchMock).toHaveBeenCalledWith('/api/view/view-key');
        expect(screen.getByText(/shared read-only snapshot of quiz results/i)).toBeTruthy();
        expect(screen.getByText(testDefinition.title)).toBeTruthy();
    });

    it('shows an invalid-link message for a missing view key', async () => {
        fetchMock.mockResolvedValueOnce(createJsonResponse({}, { status: 404 }));

        render(
            <MemoryRouter initialEntries={['/view/missing-key']}>
                <Routes>
                    <Route path="/view/:viewKey" element={<ViewResultsPage />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Unable to load results')).toBeTruthy();
        });

        expect(screen.getByText('This shared link is not found or has expired.')).toBeTruthy();
    });
});