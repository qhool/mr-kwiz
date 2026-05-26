import {
    createQuizInvitationRequestSchema,
    quizInvitationSchema,
    updateQuizInvitationRequestSchema,
} from '../../../src/lib/admin-invitations';
import { generateCapabilityToken } from '../../../src/lib/admin-token';

import { type AppEnv } from '../../utils/env';
import { getQuizByAdminKey, json } from './shared';

const invitationSelect = [
    'id',
    'invitation_key',
    'label',
    'description',
    'max_uses',
    'use_count',
    'expires_at',
    'revoked_at',
    'created_at',
    'updated_at',
].join(', ');

const listInvitationsForQuiz = async (env: Partial<AppEnv>, adminKey: string) => {
    const { quiz, supabase } = await getQuizByAdminKey(env, adminKey);

    if (!quiz) {
        return { quiz: null, invitations: null, supabase };
    }

    const { data, error } = await supabase
        .from('quiz_invitations')
        .select(invitationSelect)
        .eq('quiz_id', quiz.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

    if (error) {
        throw error;
    }

    return {
        invitations: quizInvitationSchema.array().parse(data ?? []),
        quiz,
        supabase,
    };
};

export const handleAdminInvitationsGet = async (
    env: Partial<AppEnv>,
    adminKey?: string
): Promise<Response> => {
    if (!adminKey) {
        return json({ error: 'Missing admin key.' }, { status: 400 });
    }

    try {
        const { invitations, quiz } = await listInvitationsForQuiz(env, adminKey);

        if (!quiz) {
            return json({ error: 'Quiz not found.' }, { status: 404 });
        }

        return json({ invitations });
    } catch (error) {
        return json(
            {
                error: error instanceof Error ? error.message : 'Failed to load invitations.',
            },
            { status: 500 }
        );
    }
};

export const handleAdminInvitationsPost = async (
    env: Partial<AppEnv>,
    adminKey: string | undefined,
    request: Request
): Promise<Response> => {
    if (!adminKey) {
        return json({ error: 'Missing admin key.' }, { status: 400 });
    }

    try {
        const { quiz, supabase } = await getQuizByAdminKey(env, adminKey);

        if (!quiz) {
            return json({ error: 'Quiz not found.' }, { status: 404 });
        }

        const payload = createQuizInvitationRequestSchema.parse(await request.json());
        const { data, error } = await supabase
            .from('quiz_invitations')
            .insert({
                description: payload.description,
                invitation_key: generateCapabilityToken(),
                label: payload.label,
                max_uses: payload.max_uses,
                quiz_id: quiz.id,
            })
            .select(invitationSelect)
            .single();

        if (error) {
            throw error;
        }

        return json({ invitation: quizInvitationSchema.parse(data) }, { status: 201 });
    } catch (error) {
        return json(
            {
                error: error instanceof Error ? error.message : 'Failed to create invitation.',
            },
            { status: 500 }
        );
    }
};

export const handleAdminInvitationPatch = async (
    env: Partial<AppEnv>,
    adminKey: string | undefined,
    invitationId: string | undefined,
    request: Request
): Promise<Response> => {
    if (!adminKey || !invitationId) {
        return json({ error: 'Missing admin key or invitation id.' }, { status: 400 });
    }

    try {
        const { quiz, supabase } = await getQuizByAdminKey(env, adminKey);

        if (!quiz) {
            return json({ error: 'Quiz not found.' }, { status: 404 });
        }

        const payload = updateQuizInvitationRequestSchema.parse(await request.json());
        const { data, error } = await supabase
            .from('quiz_invitations')
            .update({
                max_uses: payload.max_uses,
            })
            .eq('id', invitationId)
            .eq('quiz_id', quiz.id)
            .is('deleted_at', null)
            .select(invitationSelect)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data) {
            return json({ error: 'Invitation not found.' }, { status: 404 });
        }

        return json({ invitation: quizInvitationSchema.parse(data) });
    } catch (error) {
        return json(
            {
                error: error instanceof Error ? error.message : 'Failed to update invitation.',
            },
            { status: 500 }
        );
    }
};

export const handleAdminInvitationDeactivatePost = async (
    env: Partial<AppEnv>,
    adminKey: string | undefined,
    invitationId: string | undefined
): Promise<Response> => {
    if (!adminKey || !invitationId) {
        return json({ error: 'Missing admin key or invitation id.' }, { status: 400 });
    }

    try {
        const { quiz, supabase } = await getQuizByAdminKey(env, adminKey);

        if (!quiz) {
            return json({ error: 'Quiz not found.' }, { status: 404 });
        }

        const { data, error } = await supabase
            .from('quiz_invitations')
            .update({
                revoked_at: new Date().toISOString(),
            })
            .eq('id', invitationId)
            .eq('quiz_id', quiz.id)
            .is('deleted_at', null)
            .select(invitationSelect)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data) {
            return json({ error: 'Invitation not found.' }, { status: 404 });
        }

        return json({ invitation: quizInvitationSchema.parse(data) });
    } catch (error) {
        return json(
            {
                error: error instanceof Error ? error.message : 'Failed to deactivate invitation.',
            },
            { status: 500 }
        );
    }
};