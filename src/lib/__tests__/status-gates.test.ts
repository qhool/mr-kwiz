import { describe, expect, it } from 'vitest';

import { getQuizInvitationStatus } from '../admin-invitations';
import { getViewKeyStatus } from '../view-keys';

describe('getQuizInvitationStatus', () => {
    const now = new Date('2026-05-29T12:00:00.000Z');

    it('returns deactivated when revoked even if the invitation is also expired or exhausted', () => {
        expect(
            getQuizInvitationStatus(
                {
                    expires_at: '2026-05-29T11:59:59.000Z',
                    max_uses: 1,
                    revoked_at: '2026-05-29T10:00:00.000Z',
                    use_count: 1,
                },
                now
            )
        ).toBe('deactivated');
    });

    it('returns expired when expires_at is exactly equal to now', () => {
        expect(
            getQuizInvitationStatus(
                {
                    expires_at: '2026-05-29T12:00:00.000Z',
                    max_uses: null,
                    revoked_at: null,
                    use_count: 0,
                },
                now
            )
        ).toBe('expired');
    });

    it('returns exhausted when use_count reaches max_uses', () => {
        expect(
            getQuizInvitationStatus(
                {
                    expires_at: null,
                    max_uses: 3,
                    revoked_at: null,
                    use_count: 3,
                },
                now
            )
        ).toBe('exhausted');
    });

    it('returns active when not revoked, not expired, and still below max uses', () => {
        expect(
            getQuizInvitationStatus(
                {
                    expires_at: '2026-05-29T12:00:01.000Z',
                    max_uses: 3,
                    revoked_at: null,
                    use_count: 2,
                },
                now
            )
        ).toBe('active');
    });

    it('returns active when max_uses is null and no expiry is set', () => {
        expect(
            getQuizInvitationStatus(
                {
                    expires_at: null,
                    max_uses: null,
                    revoked_at: null,
                    use_count: 999,
                },
                now
            )
        ).toBe('active');
    });
});

describe('getViewKeyStatus', () => {
    const now = new Date('2026-05-29T12:00:00.000Z');

    it('returns revoked when revoked even if the key is also expired', () => {
        expect(
            getViewKeyStatus(
                {
                    expires_at: '2026-05-29T11:59:59.000Z',
                    revoked_at: '2026-05-29T10:00:00.000Z',
                },
                now
            )
        ).toBe('revoked');
    });

    it('returns expired when expires_at is exactly equal to now', () => {
        expect(
            getViewKeyStatus(
                {
                    expires_at: '2026-05-29T12:00:00.000Z',
                    revoked_at: null,
                },
                now
            )
        ).toBe('expired');
    });

    it('returns active when the key is not revoked and expires in the future', () => {
        expect(
            getViewKeyStatus(
                {
                    expires_at: '2026-05-29T12:00:01.000Z',
                    revoked_at: null,
                },
                now
            )
        ).toBe('active');
    });

    it('returns active when neither revocation nor expiration is set', () => {
        expect(
            getViewKeyStatus(
                {
                    expires_at: null,
                    revoked_at: null,
                },
                now
            )
        ).toBe('active');
    });
});