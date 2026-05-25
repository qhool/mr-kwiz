import React from 'react';
import { useParams } from 'react-router-dom';
import { ZodError } from 'zod';

import {
    quizDefinitionSchema,
    quizEditPatchSchema,
    type QuizDefinition,
    type QuizEditPatch,
} from '../../lib/quiz-definition';

type AdminQuizResponse = {
    quiz: {
        current_definition_version: number;
        description: string;
        id: string;
        title: string;
    };
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

const QuizEditPage: React.FC = () => {
    const { adminKey } = useParams<{ adminKey: string }>();
    const [definition, setDefinition] = React.useState<QuizDefinition | null>(null);
    const [metadata, setMetadata] = React.useState<AdminQuizResponse['quiz'] | null>(null);
    const [patchText, setPatchText] = React.useState('');
    const [error, setError] = React.useState<string | null>(null);
    const [message, setMessage] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

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
            setMetadata(body.quiz as AdminQuizResponse['quiz']);
        } catch (loadError) {
            setError(formatError(loadError));
        } finally {
            setIsLoading(false);
        }
    }, [adminKey]);

    React.useEffect(() => {
        void loadDefinition();
    }, [loadDefinition]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setMessage(null);

        if (!adminKey) {
            setError('Missing admin key.');
            return;
        }

        try {
            setIsSubmitting(true);
            const parsedPatch = quizEditPatchSchema.parse(JSON.parse(patchText)) as QuizEditPatch;

            const response = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/edit`, {
                body: JSON.stringify(parsedPatch),
                headers: {
                    'content-type': 'application/json',
                },
                method: 'POST',
            });

            const body = (await response.json()) as Partial<AdminQuizResponse> & { error?: string };
            if (!response.ok) {
                throw new Error(body.error ?? 'Failed to apply patch.');
            }

            const parsedDefinition = quizDefinitionSchema.parse(body.definition);
            setDefinition(parsedDefinition);
            setMetadata(body.quiz as AdminQuizResponse['quiz']);
            setPatchText('');
            setMessage('Patch applied successfully.');
        } catch (submitError) {
            setError(formatError(submitError));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={{ margin: '0 auto', maxWidth: 1200, padding: '2rem 1.5rem' }}>
            <header style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ marginBottom: '0.5rem' }}>Quiz Builder</h1>
                <p style={{ margin: 0 }}>
                    {metadata
                        ? `${metadata.title} · definition version ${metadata.current_definition_version}`
                        : 'Loading quiz definition...'}
                </p>
            </header>

            {error ? (
                <div
                    style={{
                        background: '#fbe9e7',
                        border: '1px solid #d86b47',
                        color: '#6f2412',
                        marginBottom: '1rem',
                        padding: '0.75rem 1rem',
                        whiteSpace: 'pre-wrap',
                    }}
                >
                    {error}
                </div>
            ) : null}

            {message ? (
                <div
                    style={{
                        background: '#edf7ed',
                        border: '1px solid #5a8f5a',
                        color: '#1f4f1f',
                        marginBottom: '1rem',
                        padding: '0.75rem 1rem',
                    }}
                >
                    {message}
                </div>
            ) : null}

            <div
                style={{
                    display: 'grid',
                    gap: '1.5rem',
                    gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)',
                }}
            >
                <section>
                    <h2>Current Definition</h2>
                    <div
                        style={{
                            background: '#fffaf0',
                            border: '1px solid #c8bfa9',
                            borderRadius: 12,
                            maxHeight: '70vh',
                            overflow: 'auto',
                            padding: '1rem',
                        }}
                    >
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {isLoading
                                ? 'Loading...'
                                : JSON.stringify(definition, null, 2)}
                        </pre>
                    </div>
                </section>

                <section>
                    <h2>Paste-Back Patch</h2>
                    <form onSubmit={handleSubmit}>
                        <textarea
                            aria-label="Quiz edit patch JSON"
                            disabled={isLoading || isSubmitting}
                            onChange={(event) => setPatchText(event.target.value)}
                            placeholder={JSON.stringify(
                                {
                                    base_definition_version: metadata?.current_definition_version ?? 1,
                                    operations: [
                                        {
                                            op: 'update_quiz_metadata',
                                            title: 'Refined quiz title',
                                        },
                                    ],
                                },
                                null,
                                2
                            )}
                            spellCheck={false}
                            style={{
                                border: '1px solid #c8bfa9',
                                borderRadius: 12,
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                fontSize: '0.95rem',
                                minHeight: '28rem',
                                padding: '1rem',
                                resize: 'vertical',
                                width: '100%',
                            }}
                            value={patchText}
                        />
                        <button
                            disabled={isLoading || isSubmitting || patchText.trim().length === 0}
                            style={{
                                background: '#30291f',
                                border: 'none',
                                borderRadius: 999,
                                color: '#f6f0df',
                                cursor: 'pointer',
                                marginTop: '1rem',
                                padding: '0.75rem 1.25rem',
                            }}
                            type="submit"
                        >
                            {isSubmitting ? 'Applying…' : 'Apply Patch'}
                        </button>
                    </form>
                </section>
            </div>
        </div>
    );
};

export default QuizEditPage;