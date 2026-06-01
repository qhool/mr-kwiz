import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

import { quizDefinitionSchema, type QuizDefinition } from '../../src/lib/quiz-definition';
import type { Database } from '../../src/types/database.generated';

type SmokeConfig = {
    adminKey: string;
    baseUrl: string;
    cleanupOwnedQuiz: boolean;
    ownedQuizId: string | null;
    runTag: string;
    supabaseServiceRoleKey: string;
    supabaseUrl: string;
};

type SmokeState = {
    invitationId?: string;
    invitationKey?: string;
    responseId?: string;
    responseKey?: string;
    viewKey?: string;
};

type JsonObject = Record<string, unknown>;

type DbHealthSnapshot = {
    activeInvitations: number;
    activeResponses: number;
    activeViewKeys: number;
    activeAnswers: number;
    activeQuizzes: number;
    snapshots: number;
};

const generatedRunTag = `smoke:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

const loadRequiredConfig = (): SmokeConfig => {
    const baseUrl = process.env.SMOKE_BASE_URL?.trim() ?? '';
    const adminKey = process.env.SMOKE_ADMIN_KEY?.trim() ?? '';
    const supabaseUrl = process.env.SMOKE_SUPABASE_URL?.trim() ?? '';
    const supabaseServiceRoleKey = process.env.SMOKE_SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
    const ownedQuizId = process.env.SMOKE_QUIZ_ID?.trim() ?? '';
    const cleanupOwnedQuiz = process.env.SMOKE_CLEANUP_OWNED_QUIZ === '1';
    const runTag = process.env.SMOKE_RUN_TAG?.trim() || generatedRunTag;

    const missing: string[] = [];
    if (!baseUrl) missing.push('SMOKE_BASE_URL');
    if (!adminKey) missing.push('SMOKE_ADMIN_KEY');
    if (!supabaseUrl) missing.push('SMOKE_SUPABASE_URL');
    if (!supabaseServiceRoleKey) missing.push('SMOKE_SUPABASE_SERVICE_ROLE_KEY');

    if (missing.length > 0) {
        throw new Error(`Missing required smoke env vars: ${missing.join(', ')}`);
    }

    return {
        adminKey,
        baseUrl: baseUrl.replace(/\/$/, ''),
        cleanupOwnedQuiz,
        ownedQuizId: ownedQuizId.length > 0 ? ownedQuizId : null,
        runTag,
        supabaseServiceRoleKey,
        supabaseUrl,
    };
};

const cfg = loadRequiredConfig();
const state: SmokeState = {};
let baselineDbHealth: DbHealthSnapshot | null = null;

const createSmokeSupabase = () => {
    return createClient<Database>(cfg.supabaseUrl, cfg.supabaseServiceRoleKey, {
        auth: { persistSession: false },
    });
};

const assertNoError = (
    step: string,
    error: { message: string; details?: string | null; hint?: string | null; code?: string } | null
) => {
    if (error) {
        const parts = [error.message, error.details, error.code].filter(Boolean).join(' | ');
        throw new Error(`${step}: ${parts || '(unknown error)'}`);
    }
};

const countRows = async (
    table:
        | 'quiz_invitations'
        | 'quiz_responses'
        | 'quiz_response_view_keys'
        | 'quiz_response_answers'
        | 'quizzes'
        | 'quiz_definition_snapshots',
    deletedAware = true
): Promise<number> => {
    const supabase = createSmokeSupabase();
    let query = supabase.from(table).select('id', { count: 'exact', head: true });

    if (deletedAware) {
        query = query.is('deleted_at', null);
    }

    const { count, error } = await query;
    assertNoError(`count rows in ${table}`, error);
    return count ?? 0;
};

const captureDbHealth = async (): Promise<DbHealthSnapshot> => {
    const [activeInvitations, activeResponses, activeViewKeys, activeAnswers, activeQuizzes, snapshots] =
        await Promise.all([
            countRows('quiz_invitations'),
            countRows('quiz_responses'),
            countRows('quiz_response_view_keys'),
            countRows('quiz_response_answers'),
            countRows('quizzes'),
            countRows('quiz_definition_snapshots', false),
        ]);

    return {
        activeAnswers,
        activeInvitations,
        activeQuizzes,
        activeResponses,
        activeViewKeys,
        snapshots,
    };
};

const assertDbNotMessedUp = async () => {
    if (!baselineDbHealth) {
        throw new Error('Baseline DB health snapshot was not captured.');
    }

    const after = await captureDbHealth();
    const expectedQuizDelta = cfg.cleanupOwnedQuiz && cfg.ownedQuizId ? 1 : 0;

    expect(after.activeInvitations).toBe(baselineDbHealth.activeInvitations);
    expect(after.activeResponses).toBe(baselineDbHealth.activeResponses);
    expect(after.activeViewKeys).toBe(baselineDbHealth.activeViewKeys);
    expect(after.activeAnswers).toBe(baselineDbHealth.activeAnswers);
    expect(after.activeQuizzes).toBe(baselineDbHealth.activeQuizzes - expectedQuizDelta);
    expect(after.snapshots).toBe(baselineDbHealth.snapshots - expectedQuizDelta);
};

const assertNoStaleRunTagRows = async () => {
    const supabase = createSmokeSupabase();
    const { data, error } = await supabase
        .from('quiz_invitations')
        .select('id')
        .or(`label.ilike.%${cfg.runTag}%,description.ilike.%${cfg.runTag}%`)
        .is('deleted_at', null);

    assertNoError('preflight stale run-tag check', error);
    const count = data?.length ?? 0;
    if (count > 0) {
        throw new Error(`Run tag collision detected for ${cfg.runTag}; found ${count} active invitations.`);
    }
};

const requestJson = async <T extends JsonObject>(path: string, init?: RequestInit): Promise<T> => {
    const url = `${cfg.baseUrl}${path}`;
    const response = await fetch(url, {
        ...init,
        headers: {
            'content-type': 'application/json',
            ...(init?.headers ?? {}),
        },
    });

    const text = await response.text();
    const body = text ? (JSON.parse(text) as JsonObject) : {};

    if (!response.ok) {
        const detail = typeof body.error === 'string' ? body.error : text;
        throw new Error(`${init?.method ?? 'GET'} ${path} failed (${response.status}): ${detail}`);
    }

    return body as T;
};

const getDefinitionQuestionById = (definition: QuizDefinition, questionId: string) => {
    return definition.questions.find((question) => question.id === questionId);
};

const answerUntilSubmitted = async (
    responseKey: string,
    definition: QuizDefinition,
    initialSession: JsonObject
): Promise<JsonObject> => {
    let currentSession = initialSession;
    let guard = 0;

    while ((currentSession.response as JsonObject).current_question_id) {
        guard += 1;
        if (guard > 100) {
            throw new Error('Answer loop exceeded guard limit.');
        }

        const questionId = (currentSession.response as JsonObject).current_question_id as string;
        const question = getDefinitionQuestionById(definition, questionId);
        if (!question || question.responses.length === 0) {
            throw new Error(`No valid response found for question ${questionId}.`);
        }

        currentSession = await requestJson<JsonObject>(
            `/api/respondent/response/${encodeURIComponent(responseKey)}/answer`,
            {
                method: 'POST',
                body: JSON.stringify({
                    answer_id: question.responses[0].id,
                    question_id: question.id,
                }),
            }
        );
    }

    return currentSession;
};

const cleanupRunArtifacts = async () => {
    const supabase = createSmokeSupabase();

    const nowIso = new Date().toISOString();

    const cleanupByResponseId = async (responseId: string) => {
        const viewKeyCleanup = await supabase
            .from('quiz_response_view_keys')
            .update({ deleted_at: nowIso, revoked_at: nowIso })
            .eq('response_id', responseId)
            .is('deleted_at', null);
        assertNoError('Cleanup step failed (quiz_response_view_keys by response_id)', viewKeyCleanup.error);

        const answerCleanup = await supabase
            .from('quiz_response_answers')
            .update({ deleted_at: nowIso })
            .eq('response_id', responseId)
            .is('deleted_at', null);
        assertNoError('Cleanup step failed (quiz_response_answers by response_id)', answerCleanup.error);

        const responseCleanup = await supabase
            .from('quiz_responses')
            .update({ deleted_at: nowIso, revoked_at: nowIso, state: 'revoked' })
            .eq('id', responseId)
            .is('deleted_at', null);
        assertNoError('Cleanup step failed (quiz_responses by id)', responseCleanup.error);
    };

    if (state.responseId) {
        await cleanupByResponseId(state.responseId);
    }

    if (state.invitationId) {
        const { data: linkedViewKeys, error: linkedViewKeysError } = await supabase
            .from('quiz_response_view_keys')
            .select('response_id')
            .eq('invitation_id', state.invitationId)
            .is('deleted_at', null);
        assertNoError('Cleanup step failed (select linked view keys by invitation_id)', linkedViewKeysError);

        const linkedResponseIds = [...new Set((linkedViewKeys ?? []).map((row) => row.response_id))];

        for (const responseId of linkedResponseIds) {
            if (responseId !== state.responseId) {
                await cleanupByResponseId(responseId);
            }
        }

        const invitationCleanup = await supabase
            .from('quiz_invitations')
            .update({ deleted_at: nowIso, revoked_at: nowIso })
            .eq('id', state.invitationId)
            .is('deleted_at', null);
        assertNoError('Cleanup step failed (quiz_invitations by id)', invitationCleanup.error);
    }

    const { data: fallbackInvitations, error: fallbackInvitationsError } = await supabase
        .from('quiz_invitations')
        .select('id')
        .ilike('description', `%${cfg.runTag}%`)
        .is('deleted_at', null);
    assertNoError('Cleanup step failed (select fallback quiz_invitations by run tag)', fallbackInvitationsError);

    for (const invitation of fallbackInvitations ?? []) {
        const { data: fallbackViewKeys, error: fallbackViewKeysError } = await supabase
            .from('quiz_response_view_keys')
            .select('response_id')
            .eq('invitation_id', invitation.id)
            .is('deleted_at', null);
        assertNoError('Cleanup step failed (select fallback view keys by invitation_id)', fallbackViewKeysError);

        const fallbackResponseIds = [...new Set((fallbackViewKeys ?? []).map((row) => row.response_id))];

        for (const responseId of fallbackResponseIds) {
            await cleanupByResponseId(responseId);
        }

        const fallbackInvitationCleanup = await supabase
            .from('quiz_invitations')
            .update({ deleted_at: nowIso, revoked_at: nowIso })
            .eq('id', invitation.id)
            .is('deleted_at', null);
        assertNoError('Cleanup step failed (fallback quiz_invitations by id)', fallbackInvitationCleanup.error);
    }

    if (cfg.cleanupOwnedQuiz && cfg.ownedQuizId) {
        const { data: quizResponses, error: quizResponsesError } = await supabase
            .from('quiz_responses')
            .select('id')
            .eq('quiz_id', cfg.ownedQuizId);
        assertNoError('Cleanup step failed (select owned quiz responses)', quizResponsesError);

        const responseIds = (quizResponses ?? []).map((response) => response.id);

        const { data: quizInvitations, error: quizInvitationsError } = await supabase
            .from('quiz_invitations')
            .select('id')
            .eq('quiz_id', cfg.ownedQuizId);
        assertNoError('Cleanup step failed (select owned quiz invitations)', quizInvitationsError);

        const invitationIds = (quizInvitations ?? []).map((invitation) => invitation.id);

        if (responseIds.length > 0) {
            const viewKeyDeleteByResponse = await supabase
                .from('quiz_response_view_keys')
                .delete()
                .in('response_id', responseIds);
            assertNoError('Cleanup step failed (delete owned quiz view keys by response)', viewKeyDeleteByResponse.error);

            const answerDelete = await supabase
                .from('quiz_response_answers')
                .delete()
                .in('response_id', responseIds);
            assertNoError('Cleanup step failed (delete owned quiz answers)', answerDelete.error);
        }

        if (invitationIds.length > 0) {
            const viewKeyDeleteByInvitation = await supabase
                .from('quiz_response_view_keys')
                .delete()
                .in('invitation_id', invitationIds);
            assertNoError('Cleanup step failed (delete owned quiz view keys by invitation)', viewKeyDeleteByInvitation.error);
        }

        const responsesDelete = await supabase
            .from('quiz_responses')
            .delete()
            .eq('quiz_id', cfg.ownedQuizId);
        assertNoError('Cleanup step failed (delete owned quiz responses)', responsesDelete.error);

        const invitationsDelete = await supabase
            .from('quiz_invitations')
            .delete()
            .eq('quiz_id', cfg.ownedQuizId);
        assertNoError('Cleanup step failed (delete owned quiz invitations)', invitationsDelete.error);

        const snapshotDelete = await supabase
            .from('quiz_definition_snapshots')
            .delete()
            .eq('quiz_id', cfg.ownedQuizId);
        assertNoError('Cleanup step failed (owned quiz snapshots)', snapshotDelete.error);

        const quizDelete = await supabase
            .from('quizzes')
            .delete()
            .eq('id', cfg.ownedQuizId);
        assertNoError('Cleanup step failed (owned quiz delete)', quizDelete.error);
    }
};

beforeAll(async () => {
    await assertNoStaleRunTagRows();
    baselineDbHealth = await captureDbHealth();
});

afterAll(async () => {
    await cleanupRunArtifacts();
    await assertDbNotMessedUp();
});

describe('deployment api smoke (dirty db safe)', () => {
    it('covers invitation pickup answer submit and view paths', async () => {
        const edit = await requestJson<JsonObject>(
            `/api/admin/${encodeURIComponent(cfg.adminKey)}/edit`
        );
        const definition = quizDefinitionSchema.parse(edit.definition);
        expect(definition.questions.length).toBeGreaterThan(0);

        const invitationResponse = await requestJson<JsonObject>(
            `/api/admin/${encodeURIComponent(cfg.adminKey)}/invitations`,
            {
                method: 'POST',
                body: JSON.stringify({
                    description: cfg.runTag,
                    label: cfg.runTag,
                    max_uses: null,
                    result_sharing_mode: 'off',
                    shareback_name: '',
                }),
            }
        );

        const invitation = invitationResponse.invitation as JsonObject;
        state.invitationId = invitation.id as string;
        state.invitationKey = invitation.invitation_key as string;

        const inviteView = await requestJson<JsonObject>(
            `/api/respondent/invite/${encodeURIComponent(state.invitationKey)}`
        );
        expect((inviteView.quiz as JsonObject).title).toBeTypeOf('string');

        const pickup = await requestJson<JsonObject>(
            `/api/respondent/invite/${encodeURIComponent(state.invitationKey)}/pickup`,
            {
                method: 'POST',
                body: JSON.stringify({}),
            }
        );

        const response = pickup.response as JsonObject;
        state.responseKey = response.response_key as string;

        const session = await requestJson<JsonObject>(
            `/api/respondent/response/${encodeURIComponent(state.responseKey)}`
        );
        state.responseId = ((session.response as JsonObject).id as string);

        const submittedSession = await answerUntilSubmitted(state.responseKey, definition, session);
        const submittedState = ((submittedSession.response as JsonObject).state as string);
        expect(submittedState).toBe('submitted');

        const listedViewKeys = await requestJson<JsonObject>(
            `/api/respondent/response/${encodeURIComponent(state.responseKey)}/view-keys`
        );
        expect(Array.isArray(listedViewKeys.view_keys)).toBe(true);

        const createdViewKey = await requestJson<JsonObject>(
            `/api/respondent/response/${encodeURIComponent(state.responseKey)}/view-keys`,
            {
                method: 'POST',
                body: JSON.stringify({
                    label: cfg.runTag,
                    notes: cfg.runTag,
                }),
            }
        );

        state.viewKey = createdViewKey.view_key as string;

        const resultView = await requestJson<JsonObject>(
            `/api/view/${encodeURIComponent(state.viewKey)}`
        );
        expect((resultView.quiz as JsonObject).id).toBeTypeOf('string');

        await requestJson<JsonObject>(
            `/api/respondent/response/${encodeURIComponent(state.responseKey)}/view-keys/${encodeURIComponent(state.viewKey)}`,
            {
                method: 'PATCH',
                body: JSON.stringify({
                    expires_at: null,
                    label: `${cfg.runTag}:patched`,
                    notes: `${cfg.runTag}:patched`,
                }),
            }
        );

        await requestJson<JsonObject>(
            `/api/respondent/response/${encodeURIComponent(state.responseKey)}/view-keys/${encodeURIComponent(state.viewKey)}/deactivate`,
            {
                method: 'POST',
                body: JSON.stringify({}),
            }
        );
    });
});
