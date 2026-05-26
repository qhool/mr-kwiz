import React from 'react';
import { useParams } from 'react-router-dom';

import { AdminShell } from '../../components/admin-shell';
import {
    quizDefinitionSchema,
    quizEditPatchSchema,
    type QuizDefinition,
    type QuizEditPatch,
} from '../../lib/quiz-definition';
import { renderAdminSkillPrompt } from '../../lib/admin-skill-prompt';
import { useAdminQuizDefinition } from '../../hooks/useAdminQuizDefinition';

type AdminQuizResponse = {
    quiz: {
        current_definition_version: number;
        description: string;
        id: string;
        title: string;
    };
    definition: QuizDefinition;
};

const extractJsonCandidate = (rawText: string): string => {
    const trimmed = rawText.trim();
    const fencedBlocks = [...trimmed.matchAll(/```([a-zA-Z0-9_-]+)?\s*\n?([\s\S]*?)```/g)];

    if (fencedBlocks.length === 0) {
        return trimmed;
    }

    const preferredBlock =
        fencedBlocks.find((match) => (match[1] ?? '').toLowerCase() === 'json') ?? fencedBlocks[0];

    return preferredBlock[2].trim();
};

const QuizEditPage: React.FC = () => {
    const { adminKey } = useParams<{ adminKey: string }>();
    const { definition, error, isLoading, metadata, setDefinition, setError, setMetadata } = useAdminQuizDefinition(adminKey);
    const [patchText, setPatchText] = React.useState('');
    const [copiedSkillBaselineVersion, setCopiedSkillBaselineVersion] = React.useState<number | null>(null);
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
            setCopiedSkillBaselineVersion(metadata.current_definition_version);
            setMessage(
                `Copied skill prompt to clipboard. Chat baseline locked to definition version ${metadata.current_definition_version}.`
            );
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
            const parsedPatch = quizEditPatchSchema.parse(JSON.parse(extractJsonCandidate(patchText))) as QuizEditPatch;

            if (
                copiedSkillBaselineVersion !== null &&
                parsedPatch.base_definition_version < copiedSkillBaselineVersion
            ) {
                throw new Error(
                    `This patch was generated from an older baseline than the copied skill prompt (expected at least version ${copiedSkillBaselineVersion}). Copy the skill again into a new chat and regenerate the edit.`
                );
            }

            const patchToSubmit: QuizEditPatch =
                copiedSkillBaselineVersion !== null &&
                parsedPatch.base_definition_version === copiedSkillBaselineVersion &&
                metadata
                    ? {
                          ...parsedPatch,
                          base_definition_version: metadata.current_definition_version,
                      }
                    : parsedPatch;

            const response = await fetch(`/api/admin/${encodeURIComponent(adminKey)}/edit`, {
                body: JSON.stringify(patchToSubmit),
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
        <AdminShell adminKey={adminKey} currentPage="edit" metadata={metadata}>
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
                        {copiedSkillBaselineVersion !== null ? (
                            <p style={{ color: '#6b5734', marginTop: 0 }}>
                                Current chat baseline: definition version {copiedSkillBaselineVersion}
                            </p>
                        ) : null}
                        <textarea
                            aria-label="Quiz edit patch JSON"
                            disabled={isLoading || isSubmitting}
                            onChange={(event) => setPatchText(event.target.value)}
                            placeholder={JSON.stringify(
                                {
                                    base_definition_version:
                                        copiedSkillBaselineVersion ?? metadata?.current_definition_version ?? 1,
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
        </AdminShell>
    );
};

export default QuizEditPage;