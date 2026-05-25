import React from 'react';
import { ZodError } from 'zod';

import { quizDefinitionSchema, type QuizDefinition } from '../lib/quiz-definition';

export type AdminQuizMetadata = {
    current_definition_version: number;
    description: string;
    id: string;
    title: string;
};

type AdminQuizResponse = {
    quiz: AdminQuizMetadata;
    definition: QuizDefinition;
};

const formatError = (error: unknown): string => {
    if (error instanceof ZodError) {
        return error.issues.map((issue) => issue.message).join('\n');
    }

    if (error instanceof Error) {
        return error.message;
    }

    return 'Unknown error.';
};

export const useAdminQuizDefinition = (adminKey?: string) => {
    const [definition, setDefinition] = React.useState<QuizDefinition | null>(null);
    const [metadata, setMetadata] = React.useState<AdminQuizMetadata | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);

    const loadDefinition = React.useCallback(async () => {
        if (!adminKey) {
            setError('Missing admin key.');
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/edit`);
            const body = (await response.json()) as Partial<AdminQuizResponse> & { error?: string };

            if (!response.ok) {
                throw new Error(body.error ?? 'Failed to load quiz definition.');
            }

            const parsedDefinition = quizDefinitionSchema.parse(body.definition);
            setDefinition(parsedDefinition);
            setMetadata(body.quiz as AdminQuizMetadata);
        } catch (loadError) {
            setError(formatError(loadError));
        } finally {
            setIsLoading(false);
        }
    }, [adminKey]);

    React.useEffect(() => {
        void loadDefinition();
    }, [loadDefinition]);

    return {
        definition,
        error,
        isLoading,
        loadDefinition,
        metadata,
        setDefinition,
        setError,
        setMetadata,
    };
};
