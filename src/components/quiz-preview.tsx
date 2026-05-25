import React from 'react';
import ReactMarkdown from 'react-markdown';

import type { DisplayConfig, Question, QuizDefinition, Trait } from '../lib/quiz-definition';

const markdownCardStyle: React.CSSProperties = {
    color: '#342c20',
    fontSize: '1rem',
    lineHeight: 1.65,
};

const surfaceStyle: React.CSSProperties = {
    background: 'rgba(255, 250, 240, 0.92)',
    border: '1px solid #c8bfa9',
    borderRadius: 20,
    boxShadow: '0 18px 45px rgba(70, 54, 28, 0.12)',
    margin: '0 auto',
    maxWidth: 820,
    overflow: 'hidden',
};

const shellStyle: React.CSSProperties = {
    padding: '2rem',
};

const emptyStateStyle: React.CSSProperties = {
    background: 'rgba(244, 235, 212, 0.9)',
    border: '1px dashed #b79e72',
    borderRadius: 16,
    color: '#5a4a2f',
    padding: '1rem 1.1rem',
};

const responseCardStyle: React.CSSProperties = {
    background: '#fffdf7',
    border: '1px solid #d9ccb0',
    borderRadius: 16,
    padding: '1rem 1rem 0.9rem',
};

const traitScoreStyle = (positionPercent: number): React.CSSProperties => ({
    background: `linear-gradient(90deg, #8b6940 0%, #8b6940 ${positionPercent}%, rgba(139, 105, 64, 0.18) ${positionPercent}%, rgba(139, 105, 64, 0.18) 100%)`,
    borderRadius: 999,
    height: 10,
    marginTop: '0.75rem',
});

const renderMarkdown = (markdown?: string) => {
    if (!markdown) {
        return null;
    }

    return (
        <div style={markdownCardStyle}>
            <ReactMarkdown>{markdown}</ReactMarkdown>
        </div>
    );
};

export const QuizPreviewSurface: React.FC<React.PropsWithChildren<{ subtitle?: string; title: string }>> = ({
    children,
    subtitle,
    title,
}) => {
    return (
        <section style={surfaceStyle}>
            <div
                style={{
                    background: 'linear-gradient(135deg, rgba(140, 108, 62, 0.16), rgba(231, 195, 120, 0.24))',
                    borderBottom: '1px solid #d9ccb0',
                    padding: '1.6rem 2rem',
                }}
            >
                <p style={{ color: '#6b5734', fontSize: '0.82rem', letterSpacing: '0.08em', margin: 0, textTransform: 'uppercase' }}>
                    Preview Surface
                </p>
                <h2 style={{ fontSize: '2rem', margin: '0.35rem 0 0.25rem' }}>{title}</h2>
                {subtitle ? <p style={{ color: '#5a4a2f', margin: 0 }}>{subtitle}</p> : null}
            </div>
            <div style={shellStyle}>{children}</div>
        </section>
    );
};

export const QuizIntroScreen: React.FC<{ definition: QuizDefinition }> = ({ definition }) => {
    return (
        <QuizPreviewSurface subtitle={definition.description || 'No description provided yet.'} title={definition.title}>
            {definition.display_config.intro_markdown ? (
                renderMarkdown(definition.display_config.intro_markdown)
            ) : (
                <div style={emptyStateStyle}>No intro markdown is defined yet.</div>
            )}
        </QuizPreviewSurface>
    );
};

export const QuizQuestionScreen: React.FC<{
    question: Question | null;
    questionIndex: number;
    questionCount: number;
}> = ({ question, questionCount, questionIndex }) => {
    if (!question) {
        return (
            <QuizPreviewSurface subtitle="Create at least one question to preview the participant experience." title="Question Preview">
                <div style={emptyStateStyle}>No questions are defined yet.</div>
            </QuizPreviewSurface>
        );
    }

    return (
        <QuizPreviewSurface
            subtitle={`Question ${questionIndex + 1} of ${questionCount}`}
            title={question.prompt}
        >
            {question.help_text ? <div style={{ marginBottom: '1.25rem' }}>{renderMarkdown(question.help_text)}</div> : null}
            <div style={{ display: 'grid', gap: '0.9rem' }}>
                {question.responses.map((response) => (
                    <article key={response.id} style={responseCardStyle}>
                        <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'space-between' }}>
                            <div>
                                <h3 style={{ fontSize: '1.05rem', margin: 0 }}>{response.label}</h3>
                                {response.help_text ? (
                                    <p style={{ color: '#68573c', margin: '0.35rem 0 0' }}>{response.help_text}</p>
                                ) : null}
                            </div>
                            <div
                                style={{
                                    alignItems: 'center',
                                    background: '#f1e6c9',
                                    borderRadius: 999,
                                    color: '#6b5734',
                                    display: 'inline-flex',
                                    fontSize: '0.8rem',
                                    height: 28,
                                    justifyContent: 'center',
                                    minWidth: 28,
                                    padding: '0 0.7rem',
                                }}
                            >
                                {response.display_order}
                            </div>
                        </div>
                    </article>
                ))}
            </div>
        </QuizPreviewSurface>
    );
};

export const QuizResultsScreen: React.FC<{
    completionMarkdown?: string;
    scaleMax: number;
    scaleMin: number;
    scores: Record<string, number>;
    traits: Trait[];
}> = ({ completionMarkdown, scaleMax, scaleMin, scores, traits }) => {
    return (
        <QuizPreviewSurface subtitle="Admin preview using simulated trait scores." title="Results Preview">
            {completionMarkdown ? <div style={{ marginBottom: '1.5rem' }}>{renderMarkdown(completionMarkdown)}</div> : null}
            {traits.length === 0 ? (
                <div style={emptyStateStyle}>No traits are defined yet, so there is nothing meaningful to show in the results view.</div>
            ) : (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    {traits.map((trait) => {
                        const score = scores[trait.id] ?? 0;
                        const safeRange = scaleMax - scaleMin === 0 ? 1 : scaleMax - scaleMin;
                        const positionPercent = Math.max(0, Math.min(100, ((score - scaleMin) / safeRange) * 100));

                        return (
                            <article key={trait.id} style={responseCardStyle}>
                                <div style={{ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                                    <div>
                                        <h3 style={{ margin: 0 }}>{trait.label}</h3>
                                        {trait.description ? (
                                            <p style={{ color: '#68573c', margin: '0.35rem 0 0' }}>{trait.description}</p>
                                        ) : null}
                                    </div>
                                    <strong style={{ color: '#4d3b22', fontSize: '1.1rem' }}>{score.toFixed(2)}</strong>
                                </div>
                                <div style={traitScoreStyle(positionPercent)} />
                                <div style={{ color: '#6b5734', display: 'flex', fontSize: '0.85rem', justifyContent: 'space-between', marginTop: '0.55rem' }}>
                                    <span>{trait.low_label}</span>
                                    <span>{trait.high_label}</span>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </QuizPreviewSurface>
    );
};
