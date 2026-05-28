import {
    QuizEditValidationError,
    applyQuizEditPatch,
    quizDefinitionSchema,
    quizEditPatchSchema,
    type QuizDefinition,
} from '../../../src/lib/quiz-definition';

import { type AppEnv } from '../../utils/env';
import { getQuizByAdminKey, json } from './shared';

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
                // QuizDefinition is structurally a valid JSON object; looseObject index signature causes Json type incompatibility
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                current_definition: persistedDefinition as any,
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