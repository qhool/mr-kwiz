import React from 'react';
import { Link, useParams } from 'react-router-dom';

import {
    quizEditPatchSchema,
    type QuizEditPatch,
} from '../../lib/quiz-definition';
import { renderAdminSkillPrompt } from '../../lib/admin-skill-prompt';
import { useAdminQuizDefinition } from '../../hooks/useAdminQuizDefinition';

const QuizEditPage: React.FC = () => {
    const { adminKey } = useParams<{ adminKey: string }>();
    const { definition, error, isLoading, metadata, setDefinition, setError, setMetadata } = useAdminQuizDefinition(adminKey);
    const [patchText, setPatchText] = React.useState('');
    const [message, setMessage] = React.useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const formatError = (submitError: unknown): string => {
        if (submitError instanceof Error) {
            return submitError.message;
        }

        return 'Unknown error.';
    };

    const handleCopySkillPrompt = async () => {
        setError(null);
        setMessage(null);

        if (!definition || !metadata) {
            setError('Quiz definition is not loaded yet.');
            return;
        }

        if (!navigator.clipboard?.writeText) {
            setError('Clipboard API is not available in this browser context.');
            return;
        }

        try {
            const prompt = renderAdminSkillPrompt(definition, metadata);
            await navigator.clipboard.writeText(prompt);
            setMessage('Copied skill prompt to clipboard.');
        } catch (copyError) {
            setError(formatError(copyError));
        }
    };

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
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1rem' }}>
                    <button
                        disabled={isLoading || !definition || !metadata}
                        onClick={() => {
                            void handleCopySkillPrompt();
                        }}
                        style={{
                            background: '#6a5032',
                            border: 'none',
                            borderRadius: 999,
                            color: '#f6f0df',
                            cursor: 'pointer',
                            padding: '0.75rem 1.25rem',
                        }}
                        type="button"
                    >
                        Copy LLM Skill Prompt
                    </button>
                    {adminKey ? (
                        <Link
                            style={{
                                alignItems: 'center',
                                background: '#4d3b22',
                                borderRadius: 999,
                                color: '#f6f0df',
                                display: 'inline-flex',
                                padding: '0.75rem 1.25rem',
                                textDecoration: 'none',
                            }}
                            to={`/admin/${encodeURIComponent(adminKey)}/preview`}
                        >
                            Open Preview
                        </Link>
                    ) : null}
                </div>
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