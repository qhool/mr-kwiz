import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { listStoredRespondentSessions } from '../../../lib/respondent-quiz';
import InvitationPickupPage from '../InvitationPickup';

const createJsonResponse = (body: unknown, init?: ResponseInit) => {
    return new Response(JSON.stringify(body), {
        headers: {
            'content-type': 'application/json',
        },
        status: 200,
        ...init,
    });
};

const createInvitationPayload = () => ({
    invitation: {
        id: '11111111-1111-4111-8111-111111111111',
        invitation_key: 'invite-key',
        label: 'Share this quiz',
        max_uses: 5,
        quiz_id: '22222222-2222-4222-8222-222222222222',
        result_sharing_mode: 'opt_out' as const,
        shareback_name: 'quiz owner',
        use_count: 0,
    },
    quiz: {
        description: 'Measure your style.',
        id: '22222222-2222-4222-8222-222222222222',
        intro_markdown: 'Welcome to the quiz.',
        title: 'Entry Quiz',
    },
});

const createPickupResponse = () => ({
    quiz: {
        description: 'Measure your style.',
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Entry Quiz',
    },
    response: {
        response_key: 'resp-key',
        resume_url: 'http://localhost/quiz/resp-key',
        started_at: '2026-05-29T12:00:00.000Z',
    },
});

describe('InvitationPickupPage', () => {
    const fetchMock = vi.fn<typeof fetch>();

    beforeEach(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
        vi.stubGlobal('fetch', fetchMock);
        fetchMock.mockReset();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('loads an invitation and creates a respondent session on pickup', async () => {
        fetchMock.mockResolvedValueOnce(createJsonResponse(createInvitationPayload()));
        fetchMock.mockResolvedValueOnce(createJsonResponse(createPickupResponse(), { status: 201 }));

        render(
            <MemoryRouter initialEntries={['/invite/invite-key']}>
                <Routes>
                    <Route path="/invite/:invitationKey" element={<InvitationPickupPage />} />
                    <Route path="/quiz/:responseKey" element={<div>Quiz Session Route</div>} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Start Quiz' })).toBeTruthy();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Start Quiz' }));

        await waitFor(() => {
            expect(screen.getByText('Quiz Session Route')).toBeTruthy();
        });

        expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/respondent/invite/invite-key');
        expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/respondent/invite/invite-key/pickup', {
            body: JSON.stringify({
                share_results_with_inviter: true,
            }),
            headers: {
                'content-type': 'application/json',
            },
            method: 'POST',
        });
        expect(listStoredRespondentSessions()).toEqual([
            expect.objectContaining({
                quiz_title: 'Entry Quiz',
                response_key: 'resp-key',
            }),
        ]);
        expect(window.sessionStorage.getItem('mrkwiz.skipIntroForResponse.resp-key')).toBe('1');
    });
});