import type { QuizDefinition } from '../quiz-definition';
import type { AnsweredQuestion } from '../respondent-quiz';

const makeMatrix = (values: number[]) => ({
    rows: 3,
    cols: 3,
    layout: 'row_major' as const,
    values,
});

const infoHeavyA = makeMatrix([1.5, 0.1, 0.1, 1.5, 0.1, 0.1, 1.5, 0.1, 0.1]);
const scoreHeavyA = makeMatrix([1.0, 0.1, 0.1, -0.5, 0.0, 0.0, 0.0, 0.0, 0.0]);

const infoHeavyB = makeMatrix([0.1, 1.5, 0.1, 0.1, 1.5, 0.1, 0.1, 1.5, 0.1]);
const scoreHeavyB = makeMatrix([0.0, 1.0, 0.1, 0.0, -0.5, 0.0, 0.0, 0.0, 0.0]);

const infoHeavyC = makeMatrix([0.1, 0.1, 1.5, 0.1, 0.1, 1.5, 0.1, 0.1, 1.5]);
const scoreHeavyC = makeMatrix([0.0, 0.0, 1.0, 0.0, 0.0, -0.5, 0.0, 0.0, 0.0]);

const infoBalanced = makeMatrix([0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8]);
const scoreBalanced = makeMatrix([0.5, 0.5, 0.5, -0.5, -0.5, -0.5, 0.0, 0.0, 0.0]);

const infoLight = makeMatrix([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
const scoreLight = makeMatrix([0.3, 0.3, 0.3, -0.3, -0.3, -0.3, 0.0, 0.0, 0.0]);

const makeResponses = (questionId: string) => [
    {
        id: `${questionId}-r1`,
        label: 'Response 1',
        help_text: '',
        value: 1,
        display_order: 1,
    },
    {
        id: `${questionId}-r2`,
        label: 'Response 2',
        help_text: '',
        value: 2,
        display_order: 2,
    },
    {
        id: `${questionId}-r3`,
        label: 'Response 3',
        help_text: '',
        value: 3,
        display_order: 3,
    },
];

const makeQuestion = (
    id: string,
    displayOrder: number,
    active: boolean,
    adaptiveEligible: boolean,
    informationMatrix: ReturnType<typeof makeMatrix>,
    scoreMatrix: ReturnType<typeof makeMatrix>
) => ({
    id,
    kind: 'single_choice' as const,
    prompt: `Prompt ${id}`,
    help_text: '',
    responses: makeResponses(id),
    score_matrix: scoreMatrix,
    information_matrix: informationMatrix,
    tags: [],
    active,
    adaptive_eligible: adaptiveEligible,
    display_order: displayOrder,
});

export const testDefinition: QuizDefinition = {
    schema_version: 1,
    definition_version: 1,
    title: 'Adaptive Selection Test Quiz',
    description: '',
    question_ordering: 'adaptive',
    traits: [
        {
            id: 'trait-a',
            label: 'Trait A',
            description: '',
            low_label: 'Low A',
            high_label: 'High A',
            display_order: 1,
        },
        {
            id: 'trait-b',
            label: 'Trait B',
            description: '',
            low_label: 'Low B',
            high_label: 'High B',
            display_order: 2,
        },
        {
            id: 'trait-c',
            label: 'Trait C',
            description: '',
            low_label: 'Low C',
            high_label: 'High C',
            display_order: 3,
        },
    ],
    questions: [
        makeQuestion('q01', 1, true, true, infoHeavyA, scoreHeavyA),
        makeQuestion('q02', 2, true, true, infoHeavyA, scoreHeavyA),
        makeQuestion('q03', 3, true, true, infoHeavyA, scoreHeavyA),
        makeQuestion('q04', 4, true, true, infoHeavyB, scoreHeavyB),
        makeQuestion('q05', 5, true, true, infoHeavyB, scoreHeavyB),
        makeQuestion('q06', 6, true, true, infoHeavyC, scoreHeavyC),
        makeQuestion('q07', 7, true, true, infoHeavyC, scoreHeavyC),
        makeQuestion('q08', 8, true, true, infoBalanced, scoreBalanced),
        makeQuestion('q09', 9, true, false, infoLight, scoreLight),
        makeQuestion('q10', 10, true, false, infoLight, scoreLight),
        makeQuestion('q11', 11, false, false, infoLight, scoreLight),
        makeQuestion('q12', 12, false, false, infoLight, scoreLight),
    ],
    scoring_config: {
        prior_info: 1,
        adaptive_selection: {
            target_info: [2.0, 2.0, 2.0],
            trait_priority: [1.0, 1.0, 1.0],
            min_questions: 3,
            max_questions: 8,
            candidate_pool_size: 6,
            candidate_count: 2,
            need_power: 1.25,
            uncertainty_weight: 0.2,
            contradiction_followup_weight: 0.35,
            contradiction_target: [0.25, 0.25, 0.25],
            axis_purity_min: 0.35,
            off_axis_penalty: 0.25,
            recent_window: 3,
            recent_redundancy_penalty: 0.2,
            skipped_penalty: 0.75,
            batch_diversity_penalty: 0.25,
            min_goodness_to_ask: 0.05,
        },
    },
    display_config: {
        archetypes: [],
    },
};

export const makeAnswers = (questionIds: string[], responseIndex = 0): AnsweredQuestion[] => {
    return questionIds.map((questionId, index) => {
        const question = testDefinition.questions.find((entry) => entry.id === questionId);
        const orderedResponses = (question?.responses ?? [])
            .slice()
            .sort((left, right) => left.display_order - right.display_order);
        const selectedResponse = orderedResponses[responseIndex] ?? orderedResponses[0];

        return {
            answer_id: selectedResponse?.id ?? `${questionId}-r1`,
            answered_at: new Date(2026, 4, 27, 12, 0, index).toISOString(),
            question_id: questionId,
        };
    });
};