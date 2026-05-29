import { describe, expect, it } from 'vitest';

import { quizDefinitionSchema, type QuizDefinition } from '../quiz-definition';
import { computeRespondentScores, type AnsweredQuestion } from '../respondent-quiz';

const buildQuestion = ({
    id,
    displayOrder,
    responses,
    scoreValues,
    infoValues,
}: {
    id: string;
    displayOrder: number;
    responses: Array<{ id: string; label: string; display_order: number }>;
    scoreValues: number[];
    infoValues: number[];
}) => ({
    id,
    kind: 'single_choice' as const,
    prompt: `Prompt ${id}`,
    help_text: '',
    responses: responses.map((response, index) => ({
        ...response,
        help_text: '',
        value: index,
    })),
    score_matrix: {
        rows: responses.length,
        cols: 0,
        layout: 'row_major' as const,
        values: scoreValues,
    },
    information_matrix: {
        rows: responses.length,
        cols: 0,
        layout: 'row_major' as const,
        values: infoValues,
    },
    tags: [],
    active: true,
    adaptive_eligible: true,
    display_order: displayOrder,
});

const buildDefinition = ({
    traits,
    questions,
    archetypes = [],
}: {
    traits: Array<{ id: string; label?: string; display_order: number }>;
    questions: Array<ReturnType<typeof buildQuestion>>;
    archetypes?: QuizDefinition['display_config']['archetypes'];
}): QuizDefinition => {
    const traitCount = traits.length;

    return quizDefinitionSchema.parse({
        schema_version: 1,
        definition_version: 1,
        title: 'Scoring test quiz',
        description: '',
        question_ordering: 'ordered',
        traits: traits.map((trait) => ({
            id: trait.id,
            label: trait.label ?? trait.id,
            description: '',
            low_label: `Low ${trait.id}`,
            high_label: `High ${trait.id}`,
            display_order: trait.display_order,
        })),
        questions: questions.map((question) => ({
            ...question,
            score_matrix: {
                ...question.score_matrix,
                cols: traitCount,
            },
            information_matrix: {
                ...question.information_matrix,
                cols: traitCount,
            },
        })),
        scoring_config: {
            prior_info: 1,
        },
        display_config: {
            archetypes,
            trait_polarity: 'bidirectional',
        },
    });
};

const answered = (question_id: string, answer_id: string, answeredAt = '2026-05-29T12:00:00.000Z'): AnsweredQuestion => ({
    question_id,
    answer_id,
    answered_at: answeredAt,
});

describe('computeRespondentScores', () => {
    it('computes exact weighted scores, info, and variance using display order lookups', () => {
        const definition = buildDefinition({
            traits: [
                { id: 'trait-b', display_order: 2 },
                { id: 'trait-a', display_order: 1 },
            ],
            questions: [
                buildQuestion({
                    id: 'q-2',
                    displayOrder: 2,
                    responses: [
                        { id: 'q-2-r2', label: 'Second', display_order: 2 },
                        { id: 'q-2-r1', label: 'First', display_order: 1 },
                    ],
                    scoreValues: [4, 5, 0, 0],
                    infoValues: [3, 1, 1, 1],
                }),
                buildQuestion({
                    id: 'q-1',
                    displayOrder: 1,
                    responses: [
                        { id: 'q-1-r2', label: 'Second', display_order: 2 },
                        { id: 'q-1-r1', label: 'First', display_order: 1 },
                    ],
                    scoreValues: [2, -1, 0, 0],
                    infoValues: [1, 3, 1, 1],
                }),
            ],
        });

        const summary = computeRespondentScores(definition, [
            answered('q-1', 'q-1-r1', '2026-05-29T12:00:00.000Z'),
            answered('q-2', 'q-2-r1', '2026-05-29T12:01:00.000Z'),
        ]);

        expect(summary.scores).toEqual({
            'trait-a': 6,
            'trait-b': 4,
        });
        expect(summary.currentInfo).toEqual([4, 4]);
        expect(summary.answeredQuestions).toHaveLength(2);
        expect(summary.answeredQuestions[0]).toMatchObject({
            answerId: 'q-1-r1',
            question: { id: 'q-1' },
            selectedResponseIndex: 0,
            contributionByTraitId: {
                'trait-a': 2,
                'trait-b': -1,
            },
        });
        expect(summary.answeredQuestions[1]).toMatchObject({
            answerId: 'q-2-r1',
            question: { id: 'q-2' },
            selectedResponseIndex: 0,
            contributionByTraitId: {
                'trait-a': 4,
                'trait-b': 5,
            },
        });
        expect(summary.traitStats['trait-a']).toEqual({
            estimate: 3.5,
            contradiction: 0.75,
            spread: Math.sqrt(0.75),
        });
        expect(summary.traitStats['trait-b']).toEqual({
            estimate: 0.5,
            contradiction: 6.75,
            spread: Math.sqrt(6.75),
        });
    });

    it('ignores unknown question ids and answer ids', () => {
        const definition = buildDefinition({
            traits: [{ id: 'trait-a', display_order: 1 }],
            questions: [
                buildQuestion({
                    id: 'q-1',
                    displayOrder: 1,
                    responses: [
                        { id: 'q-1-r1', label: 'Yes', display_order: 1 },
                        { id: 'q-1-r2', label: 'No', display_order: 2 },
                    ],
                    scoreValues: [3, -3],
                    infoValues: [2, 2],
                }),
            ],
        });

        const summary = computeRespondentScores(definition, [
            answered('missing-question', 'missing-answer'),
            answered('q-1', 'missing-answer'),
            answered('q-1', 'q-1-r1'),
        ]);

        expect(summary.scores).toEqual({ 'trait-a': 3 });
        expect(summary.currentInfo).toEqual([2]);
        expect(summary.answeredQuestions).toHaveLength(1);
        expect(summary.traitStats['trait-a']).toEqual({
            estimate: 3,
            contradiction: 0,
            spread: 0,
        });
    });

    it('keeps raw score totals while zero-information entries produce zeroed stats', () => {
        const definition = buildDefinition({
            traits: [{ id: 'trait-a', display_order: 1 }],
            questions: [
                buildQuestion({
                    id: 'q-1',
                    displayOrder: 1,
                    responses: [
                        { id: 'q-1-r1', label: 'Yes', display_order: 1 },
                        { id: 'q-1-r2', label: 'No', display_order: 2 },
                    ],
                    scoreValues: [7, -7],
                    infoValues: [0, 0],
                }),
            ],
        });

        const summary = computeRespondentScores(definition, [answered('q-1', 'q-1-r1')]);

        expect(summary.scores).toEqual({ 'trait-a': 7 });
        expect(summary.currentInfo).toEqual([0]);
        expect(summary.traitStats['trait-a']).toEqual({
            estimate: 0,
            contradiction: 0,
            spread: 0,
        });
    });

    it('falls back to zero for malformed matrix lookups instead of producing NaN', () => {
        const definition = {
            schema_version: 1,
            definition_version: 1,
            title: 'Malformed matrix quiz',
            description: '',
            question_ordering: 'ordered',
            traits: [
                {
                    id: 'trait-a',
                    label: 'trait-a',
                    description: '',
                    low_label: 'Low trait-a',
                    high_label: 'High trait-a',
                    display_order: 1,
                },
                {
                    id: 'trait-b',
                    label: 'trait-b',
                    description: '',
                    low_label: 'Low trait-b',
                    high_label: 'High trait-b',
                    display_order: 2,
                },
            ],
            questions: [
                {
                    id: 'q-1',
                    kind: 'single_choice' as const,
                    prompt: 'Prompt q-1',
                    help_text: '',
                    responses: [
                        { id: 'q-1-r1', label: 'Yes', help_text: '', value: 0, display_order: 1 },
                        { id: 'q-1-r2', label: 'No', help_text: '', value: 1, display_order: 2 },
                    ],
                    score_matrix: {
                        rows: 2,
                        cols: 2,
                        layout: 'row_major' as const,
                        values: [1],
                    },
                    information_matrix: {
                        rows: 2,
                        cols: 2,
                        layout: 'row_major' as const,
                        values: [2],
                    },
                    tags: [],
                    active: true,
                    adaptive_eligible: true,
                    display_order: 1,
                },
            ],
            scoring_config: {
                prior_info: 1,
            },
            display_config: {
                archetypes: [],
                trait_polarity: 'bidirectional' as const,
            },
        } as QuizDefinition;

        const summary = computeRespondentScores(definition, [answered('q-1', 'q-1-r1')]);

        expect(summary.scores).toEqual({
            'trait-a': 1,
            'trait-b': 0,
        });
        expect(summary.currentInfo).toEqual([2, 0]);
        expect(summary.traitStats['trait-a']).toEqual({
            estimate: 1,
            contradiction: 0,
            spread: 0,
        });
        expect(summary.traitStats['trait-b']).toEqual({
            estimate: 0,
            contradiction: 0,
            spread: 0,
        });
    });

    it('returns a stable zeroed summary for empty answers', () => {
        const definition = buildDefinition({
            traits: [
                { id: 'trait-a', display_order: 1 },
                { id: 'trait-b', display_order: 2 },
            ],
            questions: [
                buildQuestion({
                    id: 'q-1',
                    displayOrder: 1,
                    responses: [
                        { id: 'q-1-r1', label: 'Yes', display_order: 1 },
                        { id: 'q-1-r2', label: 'No', display_order: 2 },
                    ],
                    scoreValues: [1, 2, 3, 4],
                    infoValues: [1, 1, 1, 1],
                }),
            ],
        });

        const summary = computeRespondentScores(definition, []);

        expect(summary.scores).toEqual({
            'trait-a': 0,
            'trait-b': 0,
        });
        expect(summary.currentInfo).toEqual([0, 0]);
        expect(summary.answeredQuestions).toEqual([]);
        expect(summary.selectedArchetype).toBeUndefined();
        expect(summary.traitStats).toEqual({
            'trait-a': { estimate: 0, contradiction: 0, spread: 0 },
            'trait-b': { estimate: 0, contradiction: 0, spread: 0 },
        });
    });

    it('handles a single-question single-trait quiz and selects matching archetypes', () => {
        const definition = buildDefinition({
            traits: [{ id: 'focus', display_order: 1 }],
            questions: [
                buildQuestion({
                    id: 'q-1',
                    displayOrder: 1,
                    responses: [
                        { id: 'q-1-r1', label: 'Yes', display_order: 1 },
                        { id: 'q-1-r2', label: 'No', display_order: 2 },
                    ],
                    scoreValues: [2, -2],
                    infoValues: [4, 4],
                }),
            ],
            archetypes: [
                {
                    id: 'main-focus',
                    name: 'Focused',
                    description: 'Main archetype',
                    is_main: true,
                    trait_conditions: [{ trait_id: 'focus', score_min: 1.5 }],
                    compatibility_main_archetype_ids: [],
                    variants_by_main_archetype_id: {},
                    display_order: 1,
                },
                {
                    id: 'sub-focus',
                    name: 'Calm Focus',
                    description: 'Subtype archetype',
                    is_main: false,
                    trait_conditions: [{ trait_id: 'focus', contradiction_max: 0.1 }],
                    compatibility_main_archetype_ids: ['main-focus'],
                    compatibility_mode: 'allow-list',
                    variants_by_main_archetype_id: {},
                    display_order: 2,
                },
            ],
        });

        const summary = computeRespondentScores(definition, [answered('q-1', 'q-1-r1')]);

        expect(summary.scores).toEqual({ focus: 2 });
        expect(summary.currentInfo).toEqual([4]);
        expect(summary.traitStats.focus).toEqual({
            estimate: 2,
            contradiction: 0,
            spread: 0,
        });
        expect(summary.selectedArchetype).toMatchObject({
            main: { id: 'main-focus' },
            subtype: { id: 'sub-focus' },
        });
    });
});