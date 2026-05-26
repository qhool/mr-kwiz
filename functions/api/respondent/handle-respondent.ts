import {
    getNextQuestionId,
    respondentAnswerRequestSchema,
    respondentInvitationPickupSchema,
    respondentPickupCreateResponseSchema,
    respondentSessionSchema,
} from '../../../src/lib/respondent-quiz';
import { generateCapabilityToken, sha256Hex } from '../../../src/lib/admin-token';
import { getQuizInvitationStatus, quizInvitationSchema } from '../../../src/lib/admin-invitations';
import { quizDefinitionSchema } from '../../../src/lib/quiz-definition';
import type { Database } from '../../../src/types/database.generated';

import { type AppEnv } from '../../utils/env';
import { createServerSupabaseClient } from '../../utils/supabase';
import { json } from '../admin/shared';

type QuizRow = Database['public']['Tables']['quizzes']['Row'];
type InvitationRow = Database['public']['Tables']['quiz_invitations']['Row'];
type SnapshotRow = Database['public']['Tables']['quiz_definition_snapshots']['Row'];
type ResponseRow = Database['public']['Tables']['quiz_responses']['Row'];
type AnswerRow = Database['public']['Tables']['quiz_response_answers']['Row'];

const buildResumeUrl = (responseKey: string, origin: string) => {
    return `${origin.replace(/\/$/, '')}/quiz/${encodeURIComponent(responseKey)}`;
};

const getInvitationByKey = async (env: Partial<AppEnv>, invitationKey: string) => {
    const supabase = createServerSupabaseClient(env as AppEnv);

    const { data, error } = await supabase
        .from('quiz_invitations')
        .select([
            'id',
            'quiz_id',
            'invitation_key',
            'label',
            'description',
            'max_uses',
            'use_count',
            'expires_at',
            'revoked_at',
            'deleted_at',
            'created_at',
            'updated_at',
            'quizzes!quiz_invitations_quiz_id_fkey(id, title, description, current_definition, current_definition_version)',
        ].join(', '))
        .eq('invitation_key', invitationKey)
        .is('deleted_at', null)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return {
        invitation: data as (InvitationRow & {
            quizzes: Pick<QuizRow, 'current_definition' | 'current_definition_version' | 'description' | 'id' | 'title'> | null;
        }) | null,
        supabase,
    };
};

const assertInvitationIsUsable = (invitation: InvitationRow) => {
    const status = getQuizInvitationStatus(invitation);
    if (status !== 'active') {
        throw new Error(`Invitation is not usable (${status}).`);
    }
};

const ensureQuizSnapshot = async (
    supabase: ReturnType<typeof createServerSupabaseClient>,
    quiz: Pick<QuizRow, 'current_definition' | 'current_definition_version' | 'id'>
): Promise<SnapshotRow> => {
    const existing = await supabase
        .from('quiz_definition_snapshots')
        .select('*')
        .eq('quiz_id', quiz.id)
        .eq('definition_version', quiz.current_definition_version)
        .maybeSingle();

    if (existing.error) {
        throw existing.error;
    }

    if (existing.data) {
        return existing.data;
    }

    const definition = quizDefinitionSchema.parse(quiz.current_definition);
    const inserted = await supabase
        .from('quiz_definition_snapshots')
        .insert({
            definition,
            definition_version: quiz.current_definition_version,
            quiz_id: quiz.id,
        })
        .select('*')
        .single();

    if (inserted.error) {
        throw inserted.error;
    }

    return inserted.data;
};

const getResponseSessionByKey = async (env: Partial<AppEnv>, responseKey: string) => {
    const supabase = createServerSupabaseClient(env as AppEnv);
    const responseKeyDigest = await sha256Hex(responseKey);
    const responseResult = await supabase
        .from('quiz_responses')
        .select('*, quizzes!quiz_responses_quiz_id_fkey(id, title, description), quiz_definition_snapshots!quiz_responses_snapshot_id_fkey(id, definition_version, definition)')
        .eq('response_key_digest', responseKeyDigest)
        .is('deleted_at', null)
        .maybeSingle();

    if (responseResult.error) {
        throw responseResult.error;
    }

    if (!responseResult.data) {
        return { answers: [], response: null, supabase };
    }

    const answersResult = await supabase
        .from('quiz_response_answers')
        .select('*')
        .eq('response_id', responseResult.data.id)
        .is('deleted_at', null)
        .order('answered_at', { ascending: true });

    if (answersResult.error) {
        throw answersResult.error;
    }

    return {
        answers: (answersResult.data ?? []) as AnswerRow[],
        response: responseResult.data as ResponseRow & {
            quizzes: Pick<QuizRow, 'description' | 'id' | 'title'> | null;
            quiz_definition_snapshots: Pick<SnapshotRow, 'definition' | 'definition_version' | 'id'> | null;
        },
        supabase,
    };
};

const serializeRespondentSession = (
    responseKey: string,
    response: ResponseRow & {
        quizzes: Pick<QuizRow, 'description' | 'id' | 'title'> | null;
        quiz_definition_snapshots: Pick<SnapshotRow, 'definition' | 'definition_version' | 'id'> | null;
    },
    answers: AnswerRow[]
) => {
    const session = respondentSessionSchema.parse({
        answers: answers
            .filter((answer) => answer.answer_id)
            .map((answer) => ({
                answer_id: answer.answer_id as string,
                answered_at: answer.answered_at,
                question_id: answer.question_id,
            })),
        quiz: response.quizzes,
        response: {
            current_question_id: response.current_question_id,
            id: response.id,
            response_key: responseKey,
            started_at: response.started_at,
            state: response.state,
            submitted_at: response.submitted_at,
        },
        snapshot: response.quiz_definition_snapshots,
    });

    return session;
};

export const handleRespondentInvitationGet = async (
    env: Partial<AppEnv>,
    invitationKey?: string
): Promise<Response> => {
    if (!invitationKey) {
        return json({ error: 'Missing invitation key.' }, { status: 400 });
    }

    try {
        const { invitation } = await getInvitationByKey(env, invitationKey);
        if (!invitation || !invitation.quizzes) {
            return json({ error: 'Invitation not found.' }, { status: 404 });
        }

        assertInvitationIsUsable(invitation);

        return json(
            respondentInvitationPickupSchema.parse({
                invitation: quizInvitationSchema.parse(invitation),
                quiz: invitation.quizzes,
            })
        );
    } catch (error) {
        return json(
            { error: error instanceof Error ? error.message : 'Failed to load invitation.' },
            { status: 500 }
        );
    }
};

export const handleRespondentInvitationPickupPost = async (
    env: Partial<AppEnv>,
    invitationKey: string | undefined,
    request: Request
): Promise<Response> => {
    if (!invitationKey) {
        return json({ error: 'Missing invitation key.' }, { status: 400 });
    }

    try {
        const { invitation, supabase } = await getInvitationByKey(env, invitationKey);
        if (!invitation || !invitation.quizzes) {
            return json({ error: 'Invitation not found.' }, { status: 404 });
        }

        assertInvitationIsUsable(invitation);
        const snapshot = await ensureQuizSnapshot(supabase, invitation.quizzes);
        const definition = quizDefinitionSchema.parse(snapshot.definition);
        const responseKey = generateCapabilityToken();
        const responseKeyDigest = await sha256Hex(responseKey);
        const startedAt = new Date().toISOString();

        const insertedResponse = await supabase
            .from('quiz_responses')
            .insert({
                current_question_id: getNextQuestionId(definition, []),
                invitation_id: invitation.id,
                quiz_id: invitation.quiz_id,
                response_key_digest: responseKeyDigest,
                snapshot_id: snapshot.id,
                started_at: startedAt,
            })
            .select('id, started_at')
            .single();

        if (insertedResponse.error) {
            throw insertedResponse.error;
        }

        const updatedInvitation = await supabase
            .from('quiz_invitations')
            .update({
                use_count: invitation.use_count + 1,
            })
            .eq('id', invitation.id)
            .select('id')
            .single();

        if (updatedInvitation.error) {
            throw updatedInvitation.error;
        }

        const requestUrl = new URL(request.url);
        return json(
            respondentPickupCreateResponseSchema.parse({
                quiz: invitation.quizzes,
                response: {
                    response_key: responseKey,
                    resume_url: buildResumeUrl(responseKey, requestUrl.origin),
                    started_at: insertedResponse.data.started_at,
                },
            }),
            { status: 201 }
        );
    } catch (error) {
        return json(
            { error: error instanceof Error ? error.message : 'Failed to create respondent session.' },
            { status: 500 }
        );
    }
};

export const handleRespondentSessionGet = async (
    env: Partial<AppEnv>,
    responseKey?: string
): Promise<Response> => {
    if (!responseKey) {
        return json({ error: 'Missing response key.' }, { status: 400 });
    }

    try {
        const { answers, response } = await getResponseSessionByKey(env, responseKey);
        if (!response || !response.quizzes || !response.quiz_definition_snapshots) {
            return json({ error: 'Quiz response not found.' }, { status: 404 });
        }

        return json(serializeRespondentSession(responseKey, response, answers));
    } catch (error) {
        return json(
            { error: error instanceof Error ? error.message : 'Failed to load respondent session.' },
            { status: 500 }
        );
    }
};

export const handleRespondentAnswerPost = async (
    env: Partial<AppEnv>,
    responseKey: string | undefined,
    request: Request
): Promise<Response> => {
    if (!responseKey) {
        return json({ error: 'Missing response key.' }, { status: 400 });
    }

    try {
        const { answers, response, supabase } = await getResponseSessionByKey(env, responseKey);
        if (!response || !response.quizzes || !response.quiz_definition_snapshots) {
            return json({ error: 'Quiz response not found.' }, { status: 404 });
        }

        const payload = respondentAnswerRequestSchema.parse(await request.json());
        const definition = quizDefinitionSchema.parse(response.quiz_definition_snapshots.definition);
        const question = definition.questions.find((entry) => entry.id === payload.question_id);
        if (!question) {
            return json({ error: 'Question not found in snapshot.' }, { status: 400 });
        }

        if (!question.responses.some((entry) => entry.id === payload.answer_id)) {
            return json({ error: 'Answer does not belong to the requested question.' }, { status: 400 });
        }

        const existingAnswer = answers.find((answer) => answer.question_id === payload.question_id);
        const nowIso = new Date().toISOString();

        if (existingAnswer) {
            const updated = await supabase
                .from('quiz_response_answers')
                .update({
                    answer_id: payload.answer_id,
                    answered_at: nowIso,
                    revision: existingAnswer.revision + 1,
                })
                .eq('id', existingAnswer.id)
                .select('*')
                .single();

            if (updated.error) {
                throw updated.error;
            }
        } else {
            const inserted = await supabase
                .from('quiz_response_answers')
                .insert({
                    answer_id: payload.answer_id,
                    answered_at: nowIso,
                    question_id: payload.question_id,
                    response_id: response.id,
                })
                .select('*')
                .single();

            if (inserted.error) {
                throw inserted.error;
            }
        }

        const refreshed = await getResponseSessionByKey(env, responseKey);
        if (!refreshed.response || !refreshed.response.quizzes || !refreshed.response.quiz_definition_snapshots) {
            return json({ error: 'Quiz response not found after update.' }, { status: 404 });
        }

        const refreshedDefinition = quizDefinitionSchema.parse(refreshed.response.quiz_definition_snapshots.definition);
        const nextQuestionId = getNextQuestionId(
            refreshedDefinition,
            refreshed.answers
                .filter((answer) => answer.answer_id)
                .map((answer) => ({
                    answer_id: answer.answer_id as string,
                    answered_at: answer.answered_at,
                    question_id: answer.question_id,
                }))
        );

        const responseUpdate = await supabase
            .from('quiz_responses')
            .update({
                current_question_id: nextQuestionId,
                last_seen_at: nowIso,
                state: nextQuestionId ? 'started' : 'submitted',
                submitted_at: nextQuestionId ? null : nowIso,
            })
            .eq('id', response.id)
            .select('*, quizzes!quiz_responses_quiz_id_fkey(id, title, description), quiz_definition_snapshots!quiz_responses_snapshot_id_fkey(id, definition_version, definition)')
            .single();

        if (responseUpdate.error) {
            throw responseUpdate.error;
        }

        return json(
            serializeRespondentSession(responseKey, responseUpdate.data as ResponseRow & {
                quizzes: Pick<QuizRow, 'description' | 'id' | 'title'> | null;
                quiz_definition_snapshots: Pick<SnapshotRow, 'definition' | 'definition_version' | 'id'> | null;
            }, refreshed.answers)
        );
    } catch (error) {
        return json(
            { error: error instanceof Error ? error.message : 'Failed to submit answer.' },
            { status: 500 }
        );
    }
};