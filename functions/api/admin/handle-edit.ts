import {
    QuizEditValidationError,
    applyQuizEditPatch,
    quizDefinitionSchema,
    quizEditPatchSchema,
    type QuizDefinition,
} from '../../../src/lib/quiz-definition';
import { sha256Hex } from '../../../src/lib/admin-token';

import { getAppEnv, type AppEnv } from '../../utils/env';
import { createServerSupabaseClient } from '../../utils/supabase';

const json = (body: unknown, init?: ResponseInit) => {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json; charset=utf-8');

    return new Response(JSON.stringify(body), {
        ...init,
        headers,
    });
};

const getQuizByAdminKey = async (env: Partial<AppEnv>, adminKey: string) => {
    const appEnv = getAppEnv(env);
    const supabase = createServerSupabaseClient(appEnv);
    const adminKeyDigest = await sha256Hex(adminKey);

    const { data, error } = await supabase
        .from('quizzes')
        .select('*')
        .eq('admin_key_digest', adminKeyDigest)
        .is('deleted_at', null)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return {
        quiz: data,
        supabase,
    };
};

export const handleAdminEditGet = async (env: Partial<AppEnv>, adminKey?: string): Promise<Response> => {
    if (!adminKey) {
        return json({ error: 'Missing admin key.' }, { status: 400 });
    }

    try {
        const { quiz } = await getQuizByAdminKey(env, adminKey);

        if (!quiz) {
            return json({ error: 'Quiz not found.' }, { status: 404 });
        }

        const definition = quizDefinitionSchema.parse(quiz.current_definition);

        return json({
            quiz: {
                id: quiz.id,
                title: quiz.title,
                description: quiz.description,
                current_definition_version: quiz.current_definition_version,
            },
            definition,
        });
    } catch (error) {
        return json(
            {
                error: error instanceof Error ? error.message : 'Failed to load quiz definition.',
            },
            { status: 500 }
        );
    }
};

export const handleAdminEditPost = async (
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

        const patch = quizEditPatchSchema.parse(await request.json());

        if (patch.base_definition_version !== quiz.current_definition_version) {
            return json(
                {
                    error: 'Definition version conflict.',
                    current_definition_version: quiz.current_definition_version,
                },
                { status: 409 }
            );
        }

        const currentDefinition = quizDefinitionSchema.parse(quiz.current_definition);
        const nextDefinition: QuizDefinition = await applyQuizEditPatch(currentDefinition, patch);
        const nextDefinitionVersion = quiz.current_definition_version + 1;
        const persistedDefinition = quizDefinitionSchema.parse({
            ...nextDefinition,
            definition_version: nextDefinitionVersion,
        });

        const { data, error } = await supabase
            .from('quizzes')
            .update({
                current_definition: persistedDefinition,
                current_definition_version: nextDefinitionVersion,
                title: persistedDefinition.title,
                description: persistedDefinition.description,
            })
            .eq('id', quiz.id)
            .select('*')
            .single();

        if (error) {
            throw error;
        }

        return json({
            quiz: {
                id: data.id,
                title: data.title,
                description: data.description,
                current_definition_version: data.current_definition_version,
            },
            definition: persistedDefinition,
        });
    } catch (error) {
        if (error instanceof QuizEditValidationError) {
            return json(
                {
                    error: error.message,
                    issues: error.issues,
                },
                { status: 400 }
            );
        }

        return json(
            {
                error: error instanceof Error ? error.message : 'Failed to apply quiz edit patch.',
            },
            { status: 500 }
        );
    }
};