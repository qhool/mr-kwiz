import React from 'react';

import { quizDefinitionSchema, type QuizDefinition } from '../lib/quiz-definition';
import {
    respondentAnswerResponseSchema,
    respondentSessionSchema,
    type RespondentSession,
} from '../lib/respondent-quiz';

const formatError = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }

    return 'Unknown error.';
};

export const useRespondentSession = (responseKey?: string) => {
    const [definition, setDefinition] = React.useState<QuizDefinition | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isSubmittingAnswer, setIsSubmittingAnswer] = React.useState(false);
    const [session, setSession] = React.useState<RespondentSession | null>(null);

    const loadSession = React.useCallback(async () => {
        if (!responseKey) {
            setError('Missing response key.');
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/respondent/response/${encodeURIComponent(responseKey)}`);
            const body = (await response.json()) as Partial<RespondentSession> & { error?: string };

            if (!response.ok) {
                throw new Error(body.error ?? 'Failed to load quiz session.');
            }

            const parsedSession = respondentSessionSchema.parse(body);
            const parsedDefinition = quizDefinitionSchema.parse(parsedSession.snapshot.definition);
            setSession(parsedSession);
            setDefinition(parsedDefinition);
        } catch (loadError) {
            setError(formatError(loadError));
        } finally {
            setIsLoading(false);
        }
    }, [responseKey]);

    React.useEffect(() => {
        void loadSession();
    }, [loadSession]);

    const submitAnswer = React.useCallback(
        async (questionId: string, answerId: string) => {
            if (!responseKey) {
                throw new Error('Missing response key.');
            }

            setIsSubmittingAnswer(true);
            setError(null);

            try {
                const response = await fetch(`/api/respondent/response/${encodeURIComponent(responseKey)}/answer`, {
                    body: JSON.stringify({
                        answer_id: answerId,
                        question_id: questionId,
                    }),
                    headers: {
                        'content-type': 'application/json',
                    },
                    method: 'POST',
                });
                const body = (await response.json()) as Partial<RespondentSession> & { error?: string };

                if (!response.ok) {
                    throw new Error(body.error ?? 'Failed to submit answer.');
                }

                const parsedSession = respondentAnswerResponseSchema.parse(body);
                const parsedDefinition = quizDefinitionSchema.parse(parsedSession.snapshot.definition);
                setSession(parsedSession);
                setDefinition(parsedDefinition);
                return parsedSession;
            } catch (submitError) {
                const formattedError = formatError(submitError);
                setError(formattedError);
                throw new Error(formattedError);
            } finally {
                setIsSubmittingAnswer(false);
            }
        },
        [responseKey]
    );

    return {
        definition,
        error,
        isLoading,
        isSubmittingAnswer,
        loadSession,
        session,
        setError,
        submitAnswer,
    };
};