import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
    createServerSupabaseClient: vi.fn(),
}));

const adminTokenMocks = vi.hoisted(() => ({
    generateCapabilityToken: vi.fn(),
    sha256Hex: vi.fn(),
}));

vi.mock('../../../utils/supabase', () => ({
    createServerSupabaseClient: supabaseMocks.createServerSupabaseClient,
}));

vi.mock('../../../../src/lib/admin-token', () => ({
    generateCapabilityToken: adminTokenMocks.generateCapabilityToken,
    sha256Hex: adminTokenMocks.sha256Hex,
}));

import { handleRespondentInvitationPickupPost } from '../handle-respondent';
import { testDefinition } from '../../../../src/lib/__tests__/fixtures';

type QueuedResult = {
    data: unknown;
    error: unknown;
};

type RecordedOperation = {
    action: 'insert' | 'select' | 'update';
    filters: Array<{ column: string; kind: 'eq' | 'is'; value: unknown }>;
    payload: unknown;
    selectArg?: string;
    table: string;
};

const createSupabaseClientMock = (queuedResults: QueuedResult[]) => {
    const operations: RecordedOperation[] = [];

    const createBuilder = (
        table: string,
        action: RecordedOperation['action'] = 'select',
        payload: unknown = null,
        filters: RecordedOperation['filters'] = [],
        selectArg?: string
    ) => {
        const finish = async () => {
            operations.push({
                action,
                filters,
                payload,
                selectArg,
                table,
            });

            const next = queuedResults.shift();
            if (!next) {
                throw new Error(`No queued Supabase result left for ${table}.${action}`);
            }

            return next;
        };

        return {
            eq: (column: string, value: unknown) =>
                createBuilder(table, action, payload, [...filters, { column, kind: 'eq', value }], selectArg),
            insert: (nextPayload: unknown) => createBuilder(table, 'insert', nextPayload, filters, selectArg),
            is: (column: string, value: unknown) =>
                createBuilder(table, action, payload, [...filters, { column, kind: 'is', value }], selectArg),
            maybeSingle: () => finish(),
            order: () => createBuilder(table, action, payload, filters, selectArg),
            select: (nextSelectArg = '*') => createBuilder(table, action, payload, filters, nextSelectArg),
            single: () => finish(),
            update: (nextPayload: unknown) => createBuilder(table, 'update', nextPayload, filters, selectArg),
        };
    };

    return {
        client: {
            from: (table: string) => createBuilder(table),
        },
        operations,
    };
};

const createInvitationRecord = (resultSharingMode: 'mandatory' | 'off') => ({
    created_at: '2026-05-29T10:00:00.000Z',
    deleted_at: null,
    description: 'Invitation description',
    expires_at: null,
    id: '11111111-1111-4111-8111-111111111111',
    invitation_key: 'invite-key',
    label: 'Invite',
    max_uses: 5,
    quiz_id: '22222222-2222-4222-8222-222222222222',
    quizzes: {
        current_definition: {
            ...testDefinition,
        },
        current_definition_version: 1,
        description: 'Quiz description',
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Entry Quiz',
    },
    result_sharing_mode: resultSharingMode,
    revoked_at: null,
    shareback_name: 'quiz owner',
    updated_at: '2026-05-29T10:00:00.000Z',
    use_count: 0,
});

const createSnapshotRecord = () => ({
    created_at: '2026-05-29T10:00:00.000Z',
    definition: {
        ...testDefinition,
    },
    definition_version: 1,
    id: '33333333-3333-4333-8333-333333333333',
    quiz_id: '22222222-2222-4222-8222-222222222222',
    updated_at: '2026-05-29T10:00:00.000Z',
});

const createViewKeyRecord = () => ({
    created_at: '2026-05-29T10:00:00.000Z',
    expires_at: null,
    id: '55555555-5555-4555-8555-555555555555',
    invitation_id: '11111111-1111-4111-8111-111111111111',
    label: '',
    last_viewed_at: null,
    notes: '',
    response_id: '44444444-4444-4444-8444-444444444444',
    revoked_at: null,
    updated_at: '2026-05-29T10:00:00.000Z',
    view_key: 'share-key-token',
});

const appEnv = {
    APP_TOKEN_SECRET: 'secret',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    SUPABASE_URL: 'https://example.supabase.co',
};

describe('handleRespondentInvitationPickupPost', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        adminTokenMocks.generateCapabilityToken.mockReset();
        adminTokenMocks.sha256Hex.mockReset();
        supabaseMocks.createServerSupabaseClient.mockReset();
    });

    it('returns 400 when the invitation key is missing', async () => {
        const request = new Request('https://example.com/api/respondent/invite/missing/pickup', {
            method: 'POST',
        });

        const response = await handleRespondentInvitationPickupPost(appEnv, undefined, request);

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({ error: 'Missing invitation key.' });
        expect(supabaseMocks.createServerSupabaseClient).not.toHaveBeenCalled();
    });

    it('creates a response, shareback view key, and invitation increment for mandatory sharing', async () => {
        const supabase = createSupabaseClientMock([
            { data: createInvitationRecord('mandatory'), error: null },
            { data: null, error: null },
            { data: createSnapshotRecord(), error: null },
            {
                data: {
                    id: '44444444-4444-4444-8444-444444444444',
                    started_at: '2026-05-29T12:00:00.000Z',
                },
                error: null,
            },
            { data: createViewKeyRecord(), error: null },
            { data: { id: '11111111-1111-4111-8111-111111111111' }, error: null },
        ]);
        supabaseMocks.createServerSupabaseClient.mockReturnValue(supabase.client);
        adminTokenMocks.generateCapabilityToken
            .mockReturnValueOnce('response-key-token')
            .mockReturnValueOnce('share-key-token');
        adminTokenMocks.sha256Hex.mockResolvedValue('response-key-digest');

        const request = new Request('https://example.com/api/respondent/invite/invite-key/pickup', {
            body: JSON.stringify({
                share_results_with_inviter: false,
            }),
            headers: {
                'content-type': 'application/json',
            },
            method: 'POST',
        });

        const response = await handleRespondentInvitationPickupPost(appEnv, 'invite-key', request);
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(body).toEqual({
            quiz: {
                description: 'Quiz description',
                id: '22222222-2222-4222-8222-222222222222',
                title: 'Entry Quiz',
            },
            response: {
                response_key: 'response-key-token',
                resume_url: 'https://example.com/quiz/response-key-token',
                started_at: '2026-05-29T12:00:00.000Z',
            },
        });

        expect(supabase.operations).toContainEqual(
            expect.objectContaining({
                action: 'insert',
                payload: expect.objectContaining({
                    current_question_id: 'q01',
                    quiz_id: '22222222-2222-4222-8222-222222222222',
                    response_key_digest: 'response-key-digest',
                    snapshot_id: '33333333-3333-4333-8333-333333333333',
                }),
                table: 'quiz_responses',
            })
        );
        expect(supabase.operations).toContainEqual(
            expect.objectContaining({
                action: 'insert',
                payload: expect.objectContaining({
                    invitation_id: '11111111-1111-4111-8111-111111111111',
                    response_id: '44444444-4444-4444-8444-444444444444',
                    view_key: 'share-key-token',
                }),
                table: 'quiz_response_view_keys',
            })
        );
        expect(supabase.operations).toContainEqual(
            expect.objectContaining({
                action: 'update',
                payload: {
                    use_count: 1,
                },
                table: 'quiz_invitations',
            })
        );
    });

    it('skips shareback key creation when invitation sharing is off', async () => {
        const snapshot = createSnapshotRecord();
        const supabase = createSupabaseClientMock([
            { data: createInvitationRecord('off'), error: null },
            { data: snapshot, error: null },
            {
                data: {
                    id: '44444444-4444-4444-8444-444444444444',
                    started_at: '2026-05-29T12:00:00.000Z',
                },
                error: null,
            },
            { data: { id: '11111111-1111-4111-8111-111111111111' }, error: null },
        ]);
        supabaseMocks.createServerSupabaseClient.mockReturnValue(supabase.client);
        adminTokenMocks.generateCapabilityToken.mockReturnValueOnce('response-key-token');
        adminTokenMocks.sha256Hex.mockResolvedValue('response-key-digest');

        const request = new Request('https://example.com/api/respondent/invite/invite-key/pickup', {
            body: JSON.stringify({
                share_results_with_inviter: true,
            }),
            headers: {
                'content-type': 'application/json',
            },
            method: 'POST',
        });

        const response = await handleRespondentInvitationPickupPost(appEnv, 'invite-key', request);

        expect(response.status).toBe(201);
        expect(
            supabase.operations.some((operation) => operation.table === 'quiz_response_view_keys')
        ).toBe(false);
    });
});