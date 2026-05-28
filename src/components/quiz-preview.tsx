import React from 'react';
import ReactMarkdown from 'react-markdown';

import { BidirectionalBarChart, SpiderChart, UnidirectionalBarChart } from './respondent-results-charts';
import type { Question, QuizDefinition, Trait } from '../lib/quiz-definition';
import { getSelectedArchetypeDisplay, type SelectedArchetypeInfo, type TraitStatistics } from '../lib/respondent-quiz';

const markdownCardStyle: React.CSSProperties = {
    color: '#241d14',
    fontSize: '1rem',
    lineHeight: 1.65,
};

const surfaceStyle: React.CSSProperties = {
    background: '#f8f7f3',
    border: '1px solid #b8ae98',
    borderRadius: 20,
    boxShadow: '0 18px 45px rgba(45, 35, 20, 0.1)',
    margin: '0 auto',
    maxWidth: 820,
    overflow: 'hidden',
};

const shellStyle: React.CSSProperties = {
    padding: '2rem',
};

const emptyStateStyle: React.CSSProperties = {
    background: '#f1ede4',
    border: '1px dashed #9f9378',
    borderRadius: 16,
    color: '#3d3120',
    padding: '1rem 1.1rem',
};

const responseCardStyle: React.CSSProperties = {
    background: '#fcfbf8',
    border: '1px solid #c7bea9',
    borderRadius: 16,
    padding: '1rem 1rem 0.9rem',
};

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

const defaultAdminIntroMarkdown = 'Configure traits before creating questions.';

export const QuizPreviewSurface: React.FC<React.PropsWithChildren<{ eyebrow?: string; subtitle?: string; title: string }>> = ({
    children,
    eyebrow = 'Preview Surface',
    subtitle,
    title,
}) => {
    return (
        <section style={surfaceStyle}>
            <div
                style={{
                    background: 'linear-gradient(135deg, rgba(166, 154, 130, 0.2), rgba(225, 219, 203, 0.45))',
                    borderBottom: '1px solid #c2b7a1',
                    padding: '1.6rem 2rem',
                }}
            >
                <p style={{ color: '#4a3b26', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.08em', margin: 0, textTransform: 'uppercase' }}>
                    {eyebrow}
                </p>
                <h2 style={{ color: '#241d14', fontSize: '2rem', margin: '0.35rem 0 0.25rem' }}>{title}</h2>
                {subtitle ? <p style={{ color: '#3e3222', margin: 0 }}>{subtitle}</p> : null}
            </div>
            <div style={shellStyle}>{children}</div>
        </section>
    );
};

export const QuizIntroScreen: React.FC<{
    definition: QuizDefinition;
    emptyStateMessage?: string;
    suppressDefaultAdminIntro?: boolean;
}> = ({ definition, emptyStateMessage = 'No intro markdown is defined yet.', suppressDefaultAdminIntro = false }) => {
    const introMarkdown =
        suppressDefaultAdminIntro && definition.display_config.intro_markdown === defaultAdminIntroMarkdown
            ? undefined
            : definition.display_config.intro_markdown;

    return (
        <QuizPreviewSurface subtitle={definition.description || 'No description provided yet.'} title={definition.title}>
            {introMarkdown ? (
                renderMarkdown(introMarkdown)
            ) : (
                <div style={emptyStateStyle}>{emptyStateMessage}</div>
            )}
        </QuizPreviewSurface>
    );
};

export const QuizQuestionScreen: React.FC<{
    eyebrow?: string;
    onSelectResponse?: (responseId: string) => void;
    progressLabel?: string;
    progressMessage?: string;
    progressPercent?: number;
    progressPhraseOnly?: boolean;
    progressTooltip?: string;
    question: Question | null;
    questionIndex: number;
    questionCount: number;
    selectedResponseId?: string | null;
}> = ({
    eyebrow,
    onSelectResponse,
    progressLabel,
    progressMessage,
    progressPercent,
    progressPhraseOnly,
    progressTooltip,
    question,
    questionCount,
    questionIndex,
    selectedResponseId,
}) => {
    if (!question) {
        return (
            <QuizPreviewSurface eyebrow={eyebrow} subtitle="Create at least one question to preview the participant experience." title="Question Preview">
                <div style={emptyStateStyle}>No questions are defined yet.</div>
            </QuizPreviewSurface>
        );
    }

    return (
        <QuizPreviewSurface
            eyebrow={eyebrow}
            subtitle={progressLabel ?? `Question ${questionIndex + 1} of ${questionCount}`}
            title={question.prompt}
        >
            <div style={{ marginBottom: '1rem' }}>
                <div
                    aria-hidden
                    style={{
                        background: '#e4dcc8',
                        borderRadius: 999,
                        height: 10,
                        overflow: 'hidden',
                        width: '100%',
                    }}
                >
                    <div
                        style={{
                            background: 'linear-gradient(90deg, #7a5c37, #9b7c4f)',
                            height: '100%',
                            transition: 'width 220ms ease',
                            width: `${Math.max(0, Math.min(100, progressPercent ?? 0))}%`,
                        }}
                    />
                </div>
                {progressPhraseOnly ? (
                    progressMessage ? (
                        <div
                            style={{
                                alignItems: 'center',
                                color: '#6a5032',
                                display: 'inline-flex',
                                fontSize: '0.88rem',
                                gap: '0.35rem',
                                marginTop: '0.45rem',
                            }}
                        >
                            <span>{progressMessage}</span>
                            {progressTooltip ? (
                                <span
                                    aria-label={progressTooltip}
                                    role="img"
                                    style={{
                                        background: '#d8cfbb',
                                        borderRadius: '50%',
                                        color: '#4e3f29',
                                        cursor: 'help',
                                        display: 'inline-flex',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        height: 16,
                                        justifyContent: 'center',
                                        lineHeight: 1,
                                        width: 16,
                                    }}
                                    title={progressTooltip}
                                >
                                    i
                                </span>
                            ) : null}
                        </div>
                    ) : null
                ) : (
                    <>
                        <div style={{ color: '#5a4a2f', display: 'flex', fontSize: '0.85rem', justifyContent: 'space-between', marginTop: '0.45rem' }}>
                            <span style={{ alignItems: 'center', display: 'inline-flex', gap: '0.35rem' }}>
                                <span>{progressLabel ?? `Question ${questionIndex + 1} of ${questionCount}`}</span>
                                {progressTooltip ? (
                                    <span
                                        aria-label={progressTooltip}
                                        role="img"
                                        style={{
                                            background: '#d8cfbb',
                                            borderRadius: '50%',
                                            color: '#4e3f29',
                                            cursor: 'help',
                                            display: 'inline-flex',
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            height: 16,
                                            justifyContent: 'center',
                                            lineHeight: 1,
                                            width: 16,
                                        }}
                                        title={progressTooltip}
                                    >
                                        i
                                    </span>
                                ) : null}
                            </span>
                            <span>{Math.round(Math.max(0, Math.min(100, progressPercent ?? 0)))}%</span>
                        </div>
                        {progressMessage ? (
                            <div style={{ color: '#6a5032', fontSize: '0.88rem', marginTop: '0.35rem' }}>{progressMessage}</div>
                        ) : null}
                    </>
                )}
            </div>
            {question.help_text ? <div style={{ marginBottom: '1.25rem' }}>{renderMarkdown(question.help_text)}</div> : null}
            <div style={{ display: 'grid', gap: '0.9rem' }}>
                {question.responses.map((response) => (
                    <article
                        key={response.id}
                        onClick={onSelectResponse ? () => onSelectResponse(response.id) : undefined}
                        style={{
                            ...responseCardStyle,
                            border:
                                selectedResponseId === response.id
                                    ? '2px solid #8b6940'
                                    : responseCardStyle.border,
                            cursor: onSelectResponse ? 'pointer' : 'default',
                        }}
                    >
                        <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'space-between' }}>
                            <div>
                                <h3 style={{ fontSize: '1.05rem', margin: 0 }}>{response.label}</h3>
                                {response.help_text ? (
                                    <p style={{ color: '#4d3d28', margin: '0.35rem 0 0' }}>{response.help_text}</p>
                                ) : null}
                            </div>
                            <div
                                style={{
                                    alignItems: 'center',
                                    background: '#e7dfcf',
                                    borderRadius: 999,
                                    color: '#3e3222',
                                    display: 'inline-flex',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
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
    eyebrow?: string;
    scaleMax: number;
    scaleMin: number;
    scores: Record<string, number>;
    selectedArchetype?: SelectedArchetypeInfo;
    subtitle?: string;
    title?: string;
    traits: Trait[];
    traitPolarity: 'bidirectional' | 'unidirectional';
    traitStats?: Record<string, TraitStatistics>;
}> = ({ completionMarkdown, eyebrow, scaleMax, scaleMin, scores, selectedArchetype, subtitle, title = 'Results Preview', traits, traitPolarity, traitStats }) => {
    const selectedArchetypeDisplay = React.useMemo(
        () => getSelectedArchetypeDisplay(selectedArchetype),
        [selectedArchetype]
    );
    const overviewTitle = selectedArchetypeDisplay
        ? `${selectedArchetypeDisplay.mainName}${selectedArchetypeDisplay.subtypeName ? ` (${selectedArchetypeDisplay.subtypeName})` : ''}`
        : 'Overview';

    const previewTraitStats = React.useMemo<Record<string, TraitStatistics>>(() => {
        if (traitStats) {
            return traitStats;
        }

        return Object.fromEntries(
            traits.map((trait) => [
                trait.id,
                {
                    contradiction: 0,
                    estimate: scores[trait.id] ?? 0,
                    spread: 0,
                },
            ])
        );
    }, [scores, traitStats, traits]);

    return (
        <QuizPreviewSurface eyebrow={eyebrow} subtitle={subtitle ?? 'Admin preview using simulated trait scores.'} title={title}>
            {completionMarkdown ? <div style={{ marginBottom: '1.5rem' }}>{renderMarkdown(completionMarkdown)}</div> : null}
            {traits.length === 0 ? (
                <div style={emptyStateStyle}>No traits are defined yet, so there is nothing meaningful to show in the results view.</div>
            ) : (
                <div style={{ display: 'grid', gap: '2rem' }}>
                    <div>
                        <h3 style={{ marginTop: 0 }}>{overviewTitle}</h3>
                        <SpiderChart
                            polarity={traitPolarity}
                            scaleMin={scaleMin}
                            scaleMax={scaleMax}
                            traits={traits}
                            traitStats={previewTraitStats}
                        />
                    </div>
                    <div>
                        {traitPolarity === 'bidirectional' ? (
                            <BidirectionalBarChart
                                polarity={traitPolarity}
                                scaleMin={scaleMin}
                                scaleMax={scaleMax}
                                traits={traits}
                                traitStats={previewTraitStats}
                            />
                        ) : (
                            <UnidirectionalBarChart
                                polarity={traitPolarity}
                                scaleMin={scaleMin}
                                scaleMax={scaleMax}
                                traits={traits}
                                traitStats={previewTraitStats}
                            />
                        )}
                    </div>
                    {selectedArchetypeDisplay ? (
                        <div style={{ display: 'grid', gap: '0.65rem' }}>
                            <p style={{ color: '#352a1b', margin: 0 }}>{selectedArchetypeDisplay.mainDescription}</p>
                            {selectedArchetypeDisplay.subtypeDescription ? (
                                <p style={{ color: '#3f3120', margin: 0 }}>{selectedArchetypeDisplay.subtypeDescription}</p>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            )}
        </QuizPreviewSurface>
    );
};
