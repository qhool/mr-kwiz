import React from 'react';

import type { QuizDefinition, ThemeColors } from '../lib/quiz-definition';
import type { AnsweredQuestion } from '../lib/respondent-quiz';
import { deriveThemeUiColors, resolveThemeColors } from '../lib/theme-colors';

type RespondentAnswersPanelProps = {
    answers: AnsweredQuestion[];
    definition: QuizDefinition;
    themeColors?: ThemeColors;
};

const truncateTextStyle: React.CSSProperties = {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

export const RespondentAnswersPanel: React.FC<RespondentAnswersPanelProps> = ({ answers, definition, themeColors }) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [expandedQuestionId, setExpandedQuestionId] = React.useState<string | null>(null);
    const colors = React.useMemo(() => resolveThemeColors(themeColors), [themeColors]);
    const ui = React.useMemo(() => deriveThemeUiColors(colors), [colors]);

    const answeredQuestions = answers
        .map((answer) => {
            const question = definition.questions.find((entry) => entry.id === answer.question_id);
            const selectedResponse = question?.responses.find((response) => response.id === answer.answer_id) ?? null;

            if (!question || !selectedResponse) {
                return null;
            }

            return { answer, question, selectedResponse };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    if (answeredQuestions.length === 0) {
        return null;
    }

    return (
        <section
            style={{
                background: colors.panel_background,
                border: `1px solid ${colors.panel_border}`,
                borderRadius: 20,
                marginTop: '1.5rem',
                overflow: 'hidden',
            }}
        >
            <button
                onClick={() => setIsOpen((current) => !current)}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: colors.body_text,
                    cursor: 'pointer',
                    fontSize: '1rem',
                    padding: '1rem 1.2rem',
                    textAlign: 'left',
                    width: '100%',
                }}
                type="button"
            >
                <strong>View Responses</strong>
            </button>

            {isOpen ? (
                <div style={{ borderTop: `1px solid ${colors.panel_border}`, display: 'grid', gap: '0.85rem', padding: '1rem 1.2rem 1.2rem' }}>
                    {answeredQuestions.map(({ answer, question, selectedResponse }) => {
                        const isExpanded = expandedQuestionId === question.id;

                        return (
                            <article key={question.id} style={{ border: `1px solid ${colors.panel_border}`, borderRadius: 16, overflow: 'hidden' }}>
                                <button
                                    onClick={() =>
                                        setExpandedQuestionId((current) => (current === question.id ? null : question.id))
                                    }
                                    style={{
                                        background: colors.page_background,
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'grid',
                                        gap: '0.25rem',
                                        padding: '0.95rem 1rem',
                                        textAlign: 'left',
                                        width: '100%',
                                    }}
                                    type="button"
                                >
                                    <div style={{ ...truncateTextStyle, color: colors.body_text, fontWeight: 700 }}>{question.prompt}</div>
                                    <div style={{ ...truncateTextStyle, color: colors.muted_text, fontSize: '0.92rem' }}>{selectedResponse.label}</div>
                                </button>

                                {isExpanded ? (
                                    <div style={{ borderTop: `1px solid ${colors.panel_border}`, display: 'grid', gap: '0.9rem', padding: '1rem' }}>
                                        <div>
                                            <div style={{ color: colors.muted_text, fontWeight: 700, marginBottom: '0.4rem' }}>Question</div>
                                            <div style={{ color: colors.body_text }}>{question.prompt}</div>
                                        </div>
                                        <div style={{ display: 'grid', gap: '0.7rem' }}>
                                            {question.responses
                                                .slice()
                                                .sort((left, right) => left.display_order - right.display_order)
                                                .map((response) => {
                                                    const isSelected = response.id === answer.answer_id;

                                                    return (
                                                        <div
                                                            key={response.id}
                                                            style={{
                                                                background: isSelected ? ui.accent_soft : colors.page_background,
                                                                border: isSelected ? `2px solid ${colors.accent}` : `1px solid ${colors.panel_border}`,
                                                                borderRadius: 14,
                                                                padding: '0.85rem 0.95rem',
                                                            }}
                                                        >
                                                            <div style={{ color: colors.body_text, fontWeight: 700 }}>{response.label}</div>
                                                            {response.help_text ? (
                                                                <div style={{ color: colors.muted_text, marginTop: '0.3rem' }}>{response.help_text}</div>
                                                            ) : null}
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                ) : null}
                            </article>
                        );
                    })}
                </div>
            ) : null}
        </section>
    );
};