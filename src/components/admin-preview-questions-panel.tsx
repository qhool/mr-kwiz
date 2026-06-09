import React from 'react';

import type { Question, QuizDefinition } from '../lib/quiz-definition';
import { deriveThemeUiColors, resolveThemeColors } from '../lib/theme-colors';
import { QuizPreviewSurface } from './quiz-preview';

type TraitFilterBucket = 'any' | 'high' | 'low';
type FilterLogicMode = 'and' | 'or';

type TraitFilterState = {
    determination: TraitFilterBucket;
    score: TraitFilterBucket;
};

type AdminPreviewQuestionsPanelProps = {
    definition: QuizDefinition;
    editQuestionLabel?: string;
    onEditQuestion: (question: Question) => Promise<void>;
};

type QuestionTraitMetrics = {
    determinationBucket: Exclude<TraitFilterBucket, 'any'>;
    scoreBucket: Exclude<TraitFilterBucket, 'any'>;
};

type QuestionMetrics = {
    byTraitId: Record<string, QuestionTraitMetrics>;
    question: Question;
};

const getMedian = (values: number[]): number => {
    if (values.length === 0) {
        return 0;
    }

    const sorted = values.slice().sort((left, right) => left - right);
    const midpoint = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
    }

    return sorted[midpoint];
};

const formatNumber = (value: number): string => {
    if (Math.abs(value) >= 100) {
        return value.toFixed(1);
    }

    return value.toFixed(2);
};

const chipStyle = (panelBackground: string, panelBorder: string, bodyText: string): React.CSSProperties => ({
    alignItems: 'center',
    background: panelBackground,
    border: `1px solid ${panelBorder}`,
    borderRadius: 999,
    color: bodyText,
    display: 'inline-flex',
    fontSize: '0.82rem',
    gap: '0.45rem',
    lineHeight: 1,
    padding: '0.4rem 0.6rem',
});

const questionHeaderTextStyle: React.CSSProperties = {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

export const AdminPreviewQuestionsPanel: React.FC<AdminPreviewQuestionsPanelProps> = ({
    definition,
    editQuestionLabel = 'Edit This Question in Chat',
    onEditQuestion,
}) => {
    const colors = React.useMemo(() => resolveThemeColors(definition.display_config.theme_colors), [definition.display_config.theme_colors]);
    const ui = React.useMemo(() => deriveThemeUiColors(colors), [colors]);
    const [expandedQuestionId, setExpandedQuestionId] = React.useState<string | null>(null);
    const [isFilterDrawerOpen, setIsFilterDrawerOpen] = React.useState(false);
    const [searchText, setSearchText] = React.useState('');
    const [filterLogicMode, setFilterLogicMode] = React.useState<FilterLogicMode>('or');
    const [traitFilters, setTraitFilters] = React.useState<Record<string, TraitFilterState>>(() => {
        return Object.fromEntries(
            definition.traits.map((trait) => [
                trait.id,
                {
                    determination: 'any',
                    score: 'any',
                },
            ])
        );
    });

    const sortedTraits = React.useMemo(() => {
        return definition.traits.slice().sort((left, right) => left.display_order - right.display_order);
    }, [definition.traits]);

    const sortedQuestions = React.useMemo(() => {
        return definition.questions.slice().sort((left, right) => left.display_order - right.display_order);
    }, [definition.questions]);

    React.useEffect(() => {
        if (!expandedQuestionId || sortedQuestions.some((question) => question.id === expandedQuestionId)) {
            return;
        }

        setExpandedQuestionId(sortedQuestions[0]?.id ?? null);
    }, [expandedQuestionId, sortedQuestions]);

    React.useEffect(() => {
        setTraitFilters((current) => {
            const next: Record<string, TraitFilterState> = {};
            for (const trait of definition.traits) {
                next[trait.id] = current[trait.id] ?? {
                    determination: 'any',
                    score: 'any',
                };
            }

            return next;
        });
    }, [definition.traits]);

    const questionMetrics = React.useMemo<QuestionMetrics[]>(() => {
        const determinationValuesByTrait = Object.fromEntries(
            definition.traits.map((trait) => [trait.id, [] as number[]])
        );

        const perQuestionDeterminationByTrait = new Map<string, Record<string, number>>();

        for (const question of sortedQuestions) {
            const determinationByTrait: Record<string, number> = {};

            for (let traitIndex = 0; traitIndex < sortedTraits.length; traitIndex += 1) {
                const trait = sortedTraits[traitIndex];
                let totalInformation = 0;

                for (let responseIndex = 0; responseIndex < question.responses.length; responseIndex += 1) {
                    const matrixIndex = responseIndex * sortedTraits.length + traitIndex;
                    totalInformation += question.information_matrix.values[matrixIndex] ?? 0;
                }

                const averageInformation =
                    question.responses.length > 0 ? totalInformation / question.responses.length : 0;
                determinationByTrait[trait.id] = averageInformation;
                determinationValuesByTrait[trait.id]?.push(averageInformation);
            }

            perQuestionDeterminationByTrait.set(question.id, determinationByTrait);
        }

        const determinationSplitByTrait = Object.fromEntries(
            definition.traits.map((trait) => [
                trait.id,
                getMedian(determinationValuesByTrait[trait.id] ?? []),
            ])
        );

        return sortedQuestions.map((question) => {
            const byTraitId: Record<string, QuestionTraitMetrics> = {};
            const determinationByTrait = perQuestionDeterminationByTrait.get(question.id) ?? {};

            for (let traitIndex = 0; traitIndex < sortedTraits.length; traitIndex += 1) {
                const trait = sortedTraits[traitIndex];

                let minScore = Number.POSITIVE_INFINITY;
                let maxScore = Number.NEGATIVE_INFINITY;

                for (let responseIndex = 0; responseIndex < question.responses.length; responseIndex += 1) {
                    const matrixIndex = responseIndex * sortedTraits.length + traitIndex;
                    const scoreValue = question.score_matrix.values[matrixIndex] ?? 0;
                    minScore = Math.min(minScore, scoreValue);
                    maxScore = Math.max(maxScore, scoreValue);
                }

                const strongestScore = Math.abs(maxScore) >= Math.abs(minScore) ? maxScore : minScore;
                const determinationValue = determinationByTrait[trait.id] ?? 0;
                const determinationSplit = determinationSplitByTrait[trait.id] ?? 0;

                byTraitId[trait.id] = {
                    determinationBucket: determinationValue >= determinationSplit ? 'high' : 'low',
                    scoreBucket: strongestScore >= 0 ? 'high' : 'low',
                };
            }

            return { byTraitId, question };
        });
    }, [definition.traits, sortedQuestions, sortedTraits]);

    const activeTraitFilterEntries = React.useMemo(() => {
        return definition.traits
            .map((trait) => {
                const filter = traitFilters[trait.id];
                if (!filter || (filter.score === 'any' && filter.determination === 'any')) {
                    return null;
                }

                return {
                    filter,
                    trait,
                };
            })
            .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    }, [definition.traits, traitFilters]);

    const filteredQuestions = React.useMemo(() => {
        const normalizedSearch = searchText.trim().toLowerCase();

        return questionMetrics
            .map((entry) => {
                const textMatches =
                    normalizedSearch.length === 0 ||
                    entry.question.prompt.toLowerCase().includes(normalizedSearch) ||
                    entry.question.responses.some((response) =>
                        response.label.toLowerCase().includes(normalizedSearch)
                    );

                if (!textMatches) {
                    return null;
                }

                if (activeTraitFilterEntries.length === 0) {
                    return entry.question;
                }

                const matchesByTrait = activeTraitFilterEntries.map(({ filter, trait }) => {
                    const metrics = entry.byTraitId[trait.id];
                    if (!metrics) {
                        return false;
                    }

                    const scoreMatches = filter.score === 'any' || metrics.scoreBucket === filter.score;
                    const determinationMatches =
                        filter.determination === 'any' || metrics.determinationBucket === filter.determination;

                    return scoreMatches && determinationMatches;
                });

                const traitFilterMatches =
                    filterLogicMode === 'and'
                        ? matchesByTrait.every(Boolean)
                        : matchesByTrait.some(Boolean);

                return traitFilterMatches ? entry.question : null;
            })
            .filter((question): question is Question => question !== null);
    }, [activeTraitFilterEntries, filterLogicMode, questionMetrics, searchText]);

    React.useEffect(() => {
        if (filteredQuestions.length === 0) {
            setExpandedQuestionId(null);
            return;
        }

        if (expandedQuestionId && !filteredQuestions.some((question) => question.id === expandedQuestionId)) {
            setExpandedQuestionId(null);
        }
    }, [expandedQuestionId, filteredQuestions]);

    const hasAnyAppliedFilters = activeTraitFilterEntries.length > 0 || searchText.trim().length > 0;

    const clearAllFilters = () => {
        setSearchText('');
        setFilterLogicMode('or');
        setTraitFilters((current) => {
            const next = { ...current };
            for (const trait of definition.traits) {
                next[trait.id] = {
                    determination: 'any',
                    score: 'any',
                };
            }

            return next;
        });
    };

    return (
        <QuizPreviewSurface
            subtitle="Search, filter, and inspect question-level scoring behavior."
            themeColors={definition.display_config.theme_colors}
            title="Questions"
        >
            <div style={{ display: 'grid', gap: '0.85rem' }}>
                <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                    <input
                        aria-label="Search questions and responses"
                        onChange={(event) => setSearchText(event.target.value)}
                        placeholder="Search questions and responses..."
                        style={{
                            background: colors.page_background,
                            border: `1px solid ${colors.panel_border}`,
                            borderRadius: 12,
                            color: colors.body_text,
                            flex: '1 1 18rem',
                            minWidth: 0,
                            padding: '0.6rem 0.75rem',
                        }}
                        type="text"
                        value={searchText}
                    />
                    <button
                        aria-expanded={isFilterDrawerOpen}
                        onClick={() => setIsFilterDrawerOpen((current) => !current)}
                        style={{
                            alignItems: 'center',
                            background: isFilterDrawerOpen ? colors.accent : colors.page_background,
                            border: `1px solid ${isFilterDrawerOpen ? colors.accent : colors.panel_border}`,
                            borderRadius: 12,
                            color: isFilterDrawerOpen ? colors.accent_text : colors.body_text,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            gap: '0.45rem',
                            padding: '0.58rem 0.8rem',
                        }}
                        type="button"
                    >
                        <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
                            <path
                                d="M4 7h10M17 7h3M4 12h3M10 12h10M4 17h7M14 17h6"
                                stroke="currentColor"
                                strokeLinecap="round"
                                strokeWidth="1.8"
                            />
                            <circle cx="15" cy="7" fill="currentColor" r="1.6" />
                            <circle cx="7" cy="12" fill="currentColor" r="1.6" />
                            <circle cx="12" cy="17" fill="currentColor" r="1.6" />
                        </svg>
                        Filters
                    </button>
                    {hasAnyAppliedFilters ? (
                        <button
                            onClick={clearAllFilters}
                            style={{
                                background: 'transparent',
                                border: `1px solid ${colors.panel_border}`,
                                borderRadius: 999,
                                color: colors.body_text,
                                cursor: 'pointer',
                                padding: '0.45rem 0.75rem',
                            }}
                            type="button"
                        >
                            Clear all
                        </button>
                    ) : null}
                </div>

                {isFilterDrawerOpen ? (
                    <div
                        style={{
                            background: colors.panel_background,
                            border: `1px solid ${colors.panel_border}`,
                            borderRadius: 14,
                            display: 'grid',
                            gap: '0.8rem',
                            padding: '0.85rem',
                        }}
                    >
                        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '0.55rem' }}>
                            <span style={{ color: colors.body_text, fontSize: '0.88rem', fontWeight: 700 }}>Trait filter logic</span>
                            <button
                                onClick={() => setFilterLogicMode('or')}
                                style={{
                                    background: filterLogicMode === 'or' ? colors.accent : colors.page_background,
                                    border: `1px solid ${colors.panel_border}`,
                                    borderRadius: 999,
                                    color: filterLogicMode === 'or' ? colors.accent_text : colors.body_text,
                                    cursor: 'pointer',
                                    padding: '0.35rem 0.65rem',
                                }}
                                type="button"
                            >
                                OR
                            </button>
                            <button
                                onClick={() => setFilterLogicMode('and')}
                                style={{
                                    background: filterLogicMode === 'and' ? colors.accent : colors.page_background,
                                    border: `1px solid ${colors.panel_border}`,
                                    borderRadius: 999,
                                    color: filterLogicMode === 'and' ? colors.accent_text : colors.body_text,
                                    cursor: 'pointer',
                                    padding: '0.35rem 0.65rem',
                                }}
                                type="button"
                            >
                                AND
                            </button>
                        </div>

                        <div style={{ display: 'grid', gap: '0.6rem' }}>
                            {sortedTraits.map((trait) => {
                                const filter = traitFilters[trait.id] ?? {
                                    determination: 'any' as TraitFilterBucket,
                                    score: 'any' as TraitFilterBucket,
                                };

                                return (
                                    <div
                                        key={trait.id}
                                        style={{
                                            background: colors.page_background,
                                            border: `1px solid ${colors.panel_border}`,
                                            borderRadius: 12,
                                            display: 'grid',
                                            gap: '0.5rem',
                                            padding: '0.7rem',
                                        }}
                                    >
                                        <div style={{ color: colors.body_text, fontWeight: 700 }}>{trait.label}</div>
                                        <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                                            <label style={{ color: colors.body_text, display: 'grid', fontSize: '0.86rem', gap: '0.3rem' }}>
                                                Score Contribution
                                                <select
                                                    onChange={(event) => {
                                                        const value = event.target.value as TraitFilterBucket;
                                                        setTraitFilters((current) => ({
                                                            ...current,
                                                            [trait.id]: {
                                                                ...current[trait.id],
                                                                score: value,
                                                            },
                                                        }));
                                                    }}
                                                    style={{
                                                        background: colors.panel_background,
                                                        border: `1px solid ${colors.panel_border}`,
                                                        borderRadius: 10,
                                                        color: colors.body_text,
                                                        padding: '0.45rem 0.55rem',
                                                    }}
                                                    value={filter.score}
                                                >
                                                    <option value="any">Any</option>
                                                    <option value="high">High score contribution</option>
                                                    <option value="low">Low score contribution</option>
                                                </select>
                                            </label>
                                            <label style={{ color: colors.body_text, display: 'grid', fontSize: '0.86rem', gap: '0.3rem' }}>
                                                Determination
                                                <select
                                                    onChange={(event) => {
                                                        const value = event.target.value as TraitFilterBucket;
                                                        setTraitFilters((current) => ({
                                                            ...current,
                                                            [trait.id]: {
                                                                ...current[trait.id],
                                                                determination: value,
                                                            },
                                                        }));
                                                    }}
                                                    style={{
                                                        background: colors.panel_background,
                                                        border: `1px solid ${colors.panel_border}`,
                                                        borderRadius: 10,
                                                        color: colors.body_text,
                                                        padding: '0.45rem 0.55rem',
                                                    }}
                                                    value={filter.determination}
                                                >
                                                    <option value="any">Any</option>
                                                    <option value="high">High determination</option>
                                                    <option value="low">Low determination</option>
                                                </select>
                                            </label>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : null}

                {hasAnyAppliedFilters ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {searchText.trim().length > 0 ? (
                            <span style={chipStyle(colors.page_background, colors.panel_border, colors.body_text)}>
                                Search: “{searchText.trim()}”
                                <button
                                    aria-label="Remove search filter"
                                    onClick={() => setSearchText('')}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: colors.body_text,
                                        cursor: 'pointer',
                                        fontSize: '0.95rem',
                                        padding: 0,
                                    }}
                                    type="button"
                                >
                                    ×
                                </button>
                            </span>
                        ) : null}
                        {activeTraitFilterEntries.map(({ filter, trait }) => {
                            const scoreLabel =
                                filter.score === 'high'
                                    ? 'high score'
                                    : filter.score === 'low'
                                      ? 'low score'
                                      : null;
                            const determinationLabel =
                                filter.determination === 'high'
                                    ? 'high determination'
                                    : filter.determination === 'low'
                                      ? 'low determination'
                                      : null;
                            const descriptor = [scoreLabel, determinationLabel].filter(Boolean).join(' + ');

                            return (
                                <span key={trait.id} style={chipStyle(colors.page_background, colors.panel_border, colors.body_text)}>
                                    {trait.label}: {descriptor}
                                    <button
                                        aria-label={`Remove ${trait.label} filter`}
                                        onClick={() => {
                                            setTraitFilters((current) => ({
                                                ...current,
                                                [trait.id]: {
                                                    determination: 'any',
                                                    score: 'any',
                                                },
                                            }));
                                        }}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: colors.body_text,
                                            cursor: 'pointer',
                                            fontSize: '0.95rem',
                                            padding: 0,
                                        }}
                                        type="button"
                                    >
                                        ×
                                    </button>
                                </span>
                            );
                        })}
                    </div>
                ) : null}

                <div
                    style={{
                        background: colors.panel_background,
                        border: `1px solid ${colors.panel_border}`,
                        borderRadius: 16,
                        maxHeight: '62vh',
                        overflowY: 'auto',
                        padding: '0.85rem',
                    }}
                >
                    {filteredQuestions.length === 0 ? (
                        <div
                            style={{
                                background: colors.page_background,
                                border: `1px dashed ${colors.panel_border}`,
                                borderRadius: 12,
                                color: colors.muted_text,
                                padding: '0.95rem 1rem',
                            }}
                        >
                            No questions match the current filters.
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                            {filteredQuestions.map((question, index) => {
                                const isExpanded = expandedQuestionId === question.id;

                                return (
                                    <article
                                        key={question.id}
                                        style={{
                                            background: colors.page_background,
                                            border: `1px solid ${colors.panel_border}`,
                                            borderRadius: 14,
                                            overflow: 'hidden',
                                        }}
                                    >
                                        <button
                                            onClick={() =>
                                                setExpandedQuestionId((current) =>
                                                    current === question.id ? null : question.id
                                                )
                                            }
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: colors.body_text,
                                                cursor: 'pointer',
                                                display: 'grid',
                                                gap: '0.25rem',
                                                padding: '0.9rem 1rem',
                                                textAlign: 'left',
                                                width: '100%',
                                            }}
                                            type="button"
                                        >
                                            <div style={{ color: colors.muted_text, fontSize: '0.83rem', fontWeight: 700 }}>
                                                Question {index + 1}
                                            </div>
                                            <div style={{ ...questionHeaderTextStyle, fontWeight: 700 }}>
                                                {question.prompt}
                                            </div>
                                            <div style={{ ...questionHeaderTextStyle, color: colors.muted_text, fontSize: '0.88rem' }}>
                                                {question.responses.length} responses
                                            </div>
                                        </button>

                                        {isExpanded ? (
                                            <div
                                                style={{
                                                    borderTop: `1px solid ${colors.panel_border}`,
                                                    display: 'grid',
                                                    gap: '0.9rem',
                                                    padding: '1rem',
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                    <button
                                                        onClick={() => {
                                                            void onEditQuestion(question);
                                                        }}
                                                        style={{
                                                            alignItems: 'center',
                                                            background: colors.accent,
                                                            border: 'none',
                                                            borderRadius: 999,
                                                            color: colors.accent_text,
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            gap: '0.55rem',
                                                            padding: '0.62rem 0.95rem',
                                                        }}
                                                        type="button"
                                                    >
                                                        <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
                                                            <path d="M4 20h4l10.5-10.5a1.414 1.414 0 0 0 0-2L16.5 5a1.414 1.414 0 0 0-2 0L4 15.5V20Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                                                            <path d="m13.5 6 4.5 4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                                                        </svg>
                                                        {editQuestionLabel}
                                                    </button>
                                                </div>

                                                <div>
                                                    <div style={{ color: colors.muted_text, fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                                                        Prompt
                                                    </div>
                                                    <div style={{ color: colors.body_text }}>{question.prompt}</div>
                                                    {question.help_text ? (
                                                        <div style={{ color: colors.muted_text, marginTop: '0.45rem' }}>
                                                            {question.help_text}
                                                        </div>
                                                    ) : null}
                                                </div>

                                                <div style={{ display: 'grid', gap: '0.55rem' }}>
                                                    {question.responses
                                                        .slice()
                                                        .sort(
                                                            (left, right) =>
                                                                left.display_order - right.display_order
                                                        )
                                                        .map((response) => (
                                                            <div
                                                                key={response.id}
                                                                style={{
                                                                    background: colors.panel_background,
                                                                    border: `1px solid ${colors.panel_border}`,
                                                                    borderRadius: 12,
                                                                    padding: '0.65rem 0.75rem',
                                                                }}
                                                            >
                                                                <div
                                                                    style={{
                                                                        color: colors.body_text,
                                                                        fontWeight: 700,
                                                                    }}
                                                                >
                                                                    {response.label}
                                                                </div>
                                                                {response.help_text ? (
                                                                    <div
                                                                        style={{
                                                                            color: colors.muted_text,
                                                                            marginTop: '0.25rem',
                                                                        }}
                                                                    >
                                                                        {response.help_text}
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        ))}
                                                </div>

                                                <div
                                                    style={{
                                                        background: colors.page_background,
                                                        border: `1px solid ${colors.panel_border}`,
                                                        borderRadius: 12,
                                                        overflowX: 'auto',
                                                        padding: '0.65rem',
                                                    }}
                                                >
                                                    <table
                                                        style={{
                                                            borderCollapse: 'collapse',
                                                            fontSize: '0.82rem',
                                                            minWidth: 520,
                                                            width: '100%',
                                                        }}
                                                    >
                                                        <thead>
                                                            <tr>
                                                                <th
                                                                    rowSpan={2}
                                                                    style={{
                                                                        borderBottom: `1px solid ${colors.panel_border}`,
                                                                        borderRight: `1px solid ${colors.panel_border}`,
                                                                        color: colors.body_text,
                                                                        padding: '0.35rem 0.45rem',
                                                                        position: 'sticky',
                                                                        left: 0,
                                                                        background: colors.page_background,
                                                                        textAlign: 'left',
                                                                        zIndex: 1,
                                                                    }}
                                                                >
                                                                    Trait
                                                                </th>
                                                                {question.responses.map((response) => (
                                                                    <th
                                                                        colSpan={2}
                                                                        key={response.id}
                                                                        style={{
                                                                            borderBottom: `1px solid ${colors.panel_border}`,
                                                                            color: colors.body_text,
                                                                            padding: '0.35rem 0.45rem',
                                                                            textAlign: 'center',
                                                                        }}
                                                                    >
                                                                        {response.label}
                                                                    </th>
                                                                ))}
                                                            </tr>
                                                            <tr>
                                                                {question.responses.map((response) => (
                                                                    <React.Fragment key={`${response.id}-columns`}>
                                                                        <th
                                                                            style={{
                                                                                borderBottom: `1px solid ${colors.panel_border}`,
                                                                                color: colors.muted_text,
                                                                                fontWeight: 700,
                                                                                padding:
                                                                                    '0.3rem 0.35rem',
                                                                            }}
                                                                        >
                                                                            Score
                                                                        </th>
                                                                        <th
                                                                            style={{
                                                                                borderBottom: `1px solid ${colors.panel_border}`,
                                                                                color: colors.muted_text,
                                                                                fontWeight: 700,
                                                                                padding:
                                                                                    '0.3rem 0.35rem',
                                                                            }}
                                                                        >
                                                                            Info
                                                                        </th>
                                                                    </React.Fragment>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {sortedTraits.map((trait, traitIndex) => (
                                                                <tr key={trait.id}>
                                                                    <td
                                                                        style={{
                                                                            borderRight: `1px solid ${colors.panel_border}`,
                                                                            color: colors.body_text,
                                                                            fontWeight: 700,
                                                                            padding: '0.35rem 0.45rem',
                                                                            position: 'sticky',
                                                                            left: 0,
                                                                            background: colors.page_background,
                                                                        }}
                                                                    >
                                                                        {trait.label}
                                                                    </td>
                                                                    {question.responses.map(
                                                                        (response, responseIndex) => {
                                                                            const matrixIndex =
                                                                                responseIndex *
                                                                                    sortedTraits.length +
                                                                                traitIndex;
                                                                            const scoreValue =
                                                                                question.score_matrix
                                                                                    .values[matrixIndex] ??
                                                                                0;
                                                                            const informationValue =
                                                                                question
                                                                                    .information_matrix
                                                                                    .values[matrixIndex] ??
                                                                                0;

                                                                            return (
                                                                                <React.Fragment
                                                                                    key={`${trait.id}-${response.id}`}
                                                                                >
                                                                                    <td
                                                                                        style={{
                                                                                            borderBottom: `1px solid ${ui.info_border}`,
                                                                                            color: colors.body_text,
                                                                                            padding:
                                                                                                '0.35rem 0.35rem',
                                                                                            textAlign:
                                                                                                'right',
                                                                                            whiteSpace:
                                                                                                'nowrap',
                                                                                        }}
                                                                                    >
                                                                                        {formatNumber(
                                                                                            scoreValue
                                                                                        )}
                                                                                    </td>
                                                                                    <td
                                                                                        style={{
                                                                                            borderBottom: `1px solid ${ui.info_border}`,
                                                                                            color: colors.body_text,
                                                                                            padding:
                                                                                                '0.35rem 0.35rem',
                                                                                            textAlign:
                                                                                                'right',
                                                                                            whiteSpace:
                                                                                                'nowrap',
                                                                                        }}
                                                                                    >
                                                                                        {formatNumber(
                                                                                            informationValue
                                                                                        )}
                                                                                    </td>
                                                                                </React.Fragment>
                                                                            );
                                                                        }
                                                                    )}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        ) : null}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </QuizPreviewSurface>
    );
};
