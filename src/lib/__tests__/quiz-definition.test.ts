import { describe, expect, it } from 'vitest';

import {
    applyQuizEditPatch,
    createArchetypeSchema,
    createDefaultQuizDefinition,
    createQuestionSchema,
    hashQuestion,
    quizDefinitionSchema,
    type Archetype,
    type Question,
    type QuizDefinition,
} from '../quiz-definition';

const makeTrait = (id: string, display_order: number) => ({
    id,
    label: id,
    description: '',
    low_label: `Low ${id}`,
    high_label: `High ${id}`,
    display_order,
});

const makeQuestion = (
    id: string,
    display_order: number,
    traitCount: number,
    overrides: Partial<Question> = {}
): Question => ({
    id,
    kind: 'single_choice',
    prompt: `Prompt ${id}`,
    help_text: '',
    responses: [
        {
            id: `${id}-r1`,
            label: 'Yes',
            help_text: '',
            value: 1,
            display_order: 1,
        },
        {
            id: `${id}-r2`,
            label: 'No',
            help_text: '',
            value: 0,
            display_order: 2,
        },
    ],
    score_matrix: {
        rows: 2,
        cols: traitCount,
        layout: 'row_major',
        values: [1, 0, 0, 1].slice(0, 2 * traitCount),
    },
    information_matrix: {
        rows: 2,
        cols: traitCount,
        layout: 'row_major',
        values: [2, 1, 1, 2].slice(0, 2 * traitCount),
    },
    tags: [],
    active: true,
    adaptive_eligible: true,
    display_order,
    ...overrides,
});

const makeMainArchetype = (
    id: string,
    display_order: number,
    trait_id = 'trait-a',
    overrides: Partial<Archetype> = {}
): Archetype => ({
    id,
    name: id,
    description: `${id} description`,
    is_main: true,
    trait_conditions: [{ trait_id, score_min: 0 }],
    compatibility_main_archetype_ids: [],
    variants_by_main_archetype_id: {},
    display_order,
    ...overrides,
});

const makeSubtype = (
    id: string,
    display_order: number,
    overrides: Partial<Archetype> = {}
): Archetype => ({
    id,
    name: id,
    description: `${id} description`,
    is_main: false,
    trait_conditions: [{ trait_id: 'trait-a', contradiction_max: 1 }],
    compatibility_mode: 'allow-list',
    compatibility_main_archetype_ids: ['main-a'],
    variants_by_main_archetype_id: {},
    display_order,
    ...overrides,
});

const makeAdaptiveSelection = (traitCount: number) => ({
    target_info: Array.from({ length: traitCount }, () => 2),
    trait_priority: Array.from({ length: traitCount }, () => 1),
    min_questions: 1,
    max_questions: 3,
    candidate_pool_size: 4,
    candidate_count: 2,
    need_power: 1.25,
    uncertainty_weight: 0.2,
    contradiction_followup_weight: 0.35,
    contradiction_target: Array.from({ length: traitCount }, () => 0.25),
    axis_purity_min: 0.35,
    off_axis_penalty: 0.25,
    recent_window: 3,
    recent_redundancy_penalty: 0.2,
    skipped_penalty: 0.75,
    batch_diversity_penalty: 0.25,
    min_goodness_to_ask: 0.05,
});

const makeDefinition = (): QuizDefinition =>
    quizDefinitionSchema.parse({
        schema_version: 1,
        definition_version: 1,
        title: 'Quiz Definition Test',
        description: '',
        question_ordering: 'adaptive',
        traits: [makeTrait('trait-a', 1), makeTrait('trait-b', 2)],
        questions: [makeQuestion('q-1', 1, 2), makeQuestion('q-2', 2, 2)],
        scoring_config: {
            prior_info: 1,
            adaptive_selection: makeAdaptiveSelection(2),
        },
        display_config: {
            intro_markdown: 'intro',
            completion_markdown: 'done',
            trait_polarity: 'bidirectional',
            archetypes: [
                makeMainArchetype('main-a', 1),
                makeMainArchetype('main-b', 2, 'trait-b'),
                makeSubtype('sub-a', 3),
            ],
        },
    });

describe('quizDefinitionSchema', () => {
    it('accepts a valid baseline definition', () => {
        expect(() => quizDefinitionSchema.parse(makeDefinition())).not.toThrow();
    });

    it('accepts display_config without theme_colors for backward compatibility', () => {
        const definition = makeDefinition();
        delete (definition.display_config as { theme_colors?: unknown }).theme_colors;

        expect(() => quizDefinitionSchema.parse(definition)).not.toThrow();
    });

    it('rejects invalid theme_colors values', () => {
        const definition = makeDefinition();
        (definition.display_config as { theme_colors?: unknown }).theme_colors = {
            page_background: 'not-a-color',
        };

        expect(() => quizDefinitionSchema.parse(definition)).toThrow('Theme colors must be hex values like #RRGGBB or #RRGGBBAA.');
    });

    it.each([
        {
            name: 'duplicate trait ids',
            mutate: (definition: QuizDefinition) => {
                definition.traits[1] = { ...definition.traits[1]!, id: definition.traits[0]!.id };
            },
            message: 'Trait IDs must be unique.',
        },
        {
            name: 'duplicate question ids',
            mutate: (definition: QuizDefinition) => {
                definition.questions[1] = { ...definition.questions[1]!, id: definition.questions[0]!.id };
            },
            message: 'Question IDs must be unique.',
        },
        {
            name: 'duplicate response ids in a question',
            mutate: (definition: QuizDefinition) => {
                const question = definition.questions[0]!;
                question.responses[1] = { ...question.responses[1]!, id: question.responses[0]!.id };
            },
            message: 'Response IDs must be unique within question q-1.',
        },
        {
            name: 'duplicate archetype ids',
            mutate: (definition: QuizDefinition) => {
                definition.display_config.archetypes[1] = {
                    ...definition.display_config.archetypes[1]!,
                    id: definition.display_config.archetypes[0]!.id,
                };
            },
            message: 'Archetype IDs must be unique.',
        },
        {
            name: 'target_info length mismatch',
            mutate: (definition: QuizDefinition) => {
                definition.scoring_config.adaptive_selection!.target_info = [2];
            },
            message:
                'scoring_config.adaptive_selection.target_info length (1) must equal trait count (2).',
        },
        {
            name: 'trait_priority length mismatch',
            mutate: (definition: QuizDefinition) => {
                definition.scoring_config.adaptive_selection!.trait_priority = [1];
            },
            message:
                'scoring_config.adaptive_selection.trait_priority length (1) must equal trait count (2).',
        },
        {
            name: 'contradiction_target length mismatch',
            mutate: (definition: QuizDefinition) => {
                definition.scoring_config.adaptive_selection!.contradiction_target = [0.25];
            },
            message:
                'scoring_config.adaptive_selection.contradiction_target length (1) must equal trait count (2).',
        },
        {
            name: 'min_questions greater than or equal to max_questions',
            mutate: (definition: QuizDefinition) => {
                definition.scoring_config.adaptive_selection!.min_questions = 3;
                definition.scoring_config.adaptive_selection!.max_questions = 3;
            },
            message: 'scoring_config.adaptive_selection.min_questions must be less than max_questions.',
        },
        {
            name: 'questions without traits',
            mutate: (definition: QuizDefinition) => {
                definition.traits = [];
            },
            message: 'Questions cannot be defined until at least one trait exists.',
        },
        {
            name: 'score matrix shape mismatch',
            mutate: (definition: QuizDefinition) => {
                definition.questions[0]!.score_matrix.rows = 1;
            },
            message: 'score_matrix shape for question q-1 must match responses x traits.',
        },
        {
            name: 'information matrix shape mismatch',
            mutate: (definition: QuizDefinition) => {
                definition.questions[0]!.information_matrix.cols = 1;
            },
            message: 'information_matrix shape for question q-1 must match responses x traits.',
        },
        {
            name: 'score matrix values length mismatch',
            mutate: (definition: QuizDefinition) => {
                definition.questions[0]!.score_matrix.values = [1, 0, 0];
            },
            message: 'score_matrix values length for question q-1 must equal rows * cols.',
        },
        {
            name: 'information matrix values length mismatch',
            mutate: (definition: QuizDefinition) => {
                definition.questions[0]!.information_matrix.values = [2, 1, 1];
            },
            message: 'information_matrix values length for question q-1 must equal rows * cols.',
        },
        {
            name: 'archetype references unknown trait',
            mutate: (definition: QuizDefinition) => {
                definition.display_config.archetypes[0]!.trait_conditions[0] = {
                    trait_id: 'missing-trait',
                    score_min: 0,
                };
            },
            message: 'Archetype main-a references unknown trait missing-trait.',
        },
        {
            name: 'archetype score bounds inverted',
            mutate: (definition: QuizDefinition) => {
                definition.display_config.archetypes[0]!.trait_conditions[0] = {
                    trait_id: 'trait-a',
                    score_min: 2,
                    score_max: 1,
                };
            },
            message: 'Archetype main-a has score_min greater than score_max for trait trait-a.',
        },
        {
            name: 'archetype contradiction bounds inverted',
            mutate: (definition: QuizDefinition) => {
                definition.display_config.archetypes[0]!.trait_conditions[0] = {
                    trait_id: 'trait-a',
                    contradiction_min: 2,
                    contradiction_max: 1,
                };
            },
            message: 'Archetype main-a has contradiction_min greater than contradiction_max for trait trait-a.',
        },
        {
            name: 'subtype compatibility references unknown main archetype',
            mutate: (definition: QuizDefinition) => {
                definition.display_config.archetypes[2]!.compatibility_main_archetype_ids = ['missing-main'];
            },
            message: 'Subtype archetype sub-a references unknown main archetype missing-main.',
        },
        {
            name: 'subtype variant references unknown main archetype',
            mutate: (definition: QuizDefinition) => {
                definition.display_config.archetypes[2]!.variants_by_main_archetype_id = {
                    'missing-main': {
                        name: 'Variant',
                        description: 'Variant description',
                    },
                };
            },
            message: 'Subtype archetype sub-a defines variant for unknown main archetype missing-main.',
        },
        {
            name: 'main archetype cannot define variants',
            mutate: (definition: QuizDefinition) => {
                definition.display_config.archetypes[0]!.variants_by_main_archetype_id = {
                    'main-a': {
                        name: 'Variant',
                        description: 'Variant description',
                    },
                };
            },
            message: 'Main archetype main-a cannot define variants_by_main_archetype_id.',
        },
        {
            name: 'subtype compatibility mode requires ids',
            mutate: (definition: QuizDefinition) => {
                definition.display_config.archetypes[2] = makeSubtype('sub-a', 3, {
                    compatibility_main_archetype_ids: [],
                });
            },
            message:
                'Subtype archetype sub-a must include compatibility_main_archetype_ids when compatibility_mode is set.',
        },
        {
            name: 'main archetype cannot define compatibility mode',
            mutate: (definition: QuizDefinition) => {
                definition.display_config.archetypes[0] = makeMainArchetype('main-a', 1, 'trait-a', {
                    compatibility_mode: 'allow-list',
                });
            },
            message: 'Main archetype main-a cannot define compatibility_mode.',
        },
        {
            name: 'main archetype cannot define compatibility ids',
            mutate: (definition: QuizDefinition) => {
                definition.display_config.archetypes[0] = makeMainArchetype('main-a', 1, 'trait-a', {
                    compatibility_main_archetype_ids: ['main-b'],
                });
            },
            message: 'Main archetype main-a cannot define compatibility_main_archetype_ids.',
        },
    ])('rejects $name', ({ mutate, message }) => {
        const definition = makeDefinition();
        mutate(definition);

        expect(() => quizDefinitionSchema.parse(definition)).toThrow(message);
    });
});

describe('quiz edit operation schemas', () => {
    it('rejects create_question operations that specify both before and after anchors', () => {
        expect(() =>
            createQuestionSchema.parse({
                op: 'create_question',
                question: makeQuestion('q-3', 3, 2),
                before_question_id: 'q-1',
                after_question_id: 'q-2',
            })
        ).toThrow('create_question cannot specify both before_question_id and after_question_id.');
    });

    it('rejects create_archetype operations that specify both before and after anchors', () => {
        expect(() =>
            createArchetypeSchema.parse({
                op: 'create_archetype',
                archetype: makeMainArchetype('main-c', 3),
                before_archetype_id: 'main-a',
                after_archetype_id: 'main-b',
            })
        ).toThrow('create_archetype cannot specify both before_archetype_id and after_archetype_id.');
    });
});

describe('applyQuizEditPatch', () => {
    it('applies top-level and trait operations successfully', async () => {
        const definition = createDefaultQuizDefinition('Draft', 'Original');

        const updated = await applyQuizEditPatch(definition, {
            base_definition_version: 1,
            operations: [
                {
                    op: 'update_quiz_metadata',
                    title: 'Published',
                    description: 'Updated description',
                    question_ordering: 'random',
                },
                {
                    op: 'replace_scoring_config',
                    scoring_config: {
                        prior_info: 2,
                        adaptive_selection: makeAdaptiveSelection(3),
                    },
                },
                {
                    op: 'replace_display_config',
                    display_config: {
                        intro_markdown: 'hello',
                        completion_markdown: 'bye',
                        trait_polarity: 'unidirectional',
                        archetypes: [],
                    },
                },
                {
                    op: 'set_traits',
                    traits: [makeTrait('trait-a', 1), makeTrait('trait-b', 2), makeTrait('trait-c', 3)],
                },
                {
                    op: 'update_trait_text',
                    trait_id: 'trait-b',
                    label: 'Updated trait-b',
                    description: 'Trait B description',
                    low_label: 'Low updated',
                    high_label: 'High updated',
                },
                {
                    op: 'reorder_traits',
                    trait_ids: ['trait-c', 'trait-b', 'trait-a'],
                },
            ],
        });

        expect(updated.title).toBe('Published');
        expect(updated.description).toBe('Updated description');
        expect(updated.question_ordering).toBe('random');
        expect(updated.scoring_config.prior_info).toBe(2);
        expect(updated.scoring_config.adaptive_selection?.target_info).toEqual([2, 2, 2]);
        expect(updated.display_config).toMatchObject({
            intro_markdown: 'hello',
            completion_markdown: 'bye',
            trait_polarity: 'unidirectional',
            archetypes: [],
        });
        expect(updated.traits.map((trait) => trait.id)).toEqual(['trait-c', 'trait-b', 'trait-a']);
        expect(updated.traits.map((trait) => trait.display_order)).toEqual([1, 2, 3]);
        expect(updated.traits[1]).toMatchObject({
            id: 'trait-b',
            label: 'Updated trait-b',
            description: 'Trait B description',
            low_label: 'Low updated',
            high_label: 'High updated',
        });
    });

    it('applies question lifecycle operations successfully', async () => {
        const definition = makeDefinition();
        const createdQuestion = makeQuestion('q-3', 3, definition.traits.length);

        const afterCreate = await applyQuizEditPatch(definition, {
            base_definition_version: 1,
            operations: [
                {
                    op: 'create_question',
                    question: createdQuestion,
                    after_question_id: 'q-1',
                },
            ],
        });

        expect(afterCreate.questions.map((question) => question.id)).toEqual(['q-1', 'q-3', 'q-2']);

        const replacement = {
            ...afterCreate.questions.find((question) => question.id === 'q-3')!,
            prompt: 'Replaced prompt',
        };
        const replacementHash = await hashQuestion(afterCreate.questions.find((question) => question.id === 'q-3')!);
        const afterReplace = await applyQuizEditPatch(afterCreate, {
            base_definition_version: 1,
            operations: [
                {
                    op: 'replace_question',
                    question_id: 'q-3',
                    old_question_hash: replacementHash,
                    question: replacement,
                },
            ],
        });

        expect(afterReplace.questions.find((question) => question.id === 'q-3')?.prompt).toBe('Replaced prompt');

        const afterReorder = await applyQuizEditPatch(afterReplace, {
            base_definition_version: 1,
            operations: [
                {
                    op: 'reorder_questions',
                    question_ids: ['q-2', 'q-3', 'q-1'],
                },
            ],
        });

        expect(afterReorder.questions.map((question) => question.id)).toEqual(['q-2', 'q-3', 'q-1']);
        expect(afterReorder.questions.map((question) => question.display_order)).toEqual([1, 2, 3]);

        const deleteHash = await hashQuestion(afterReorder.questions.find((question) => question.id === 'q-2')!);
        const afterDelete = await applyQuizEditPatch(afterReorder, {
            base_definition_version: 1,
            operations: [
                {
                    op: 'delete_question',
                    question_id: 'q-2',
                    old_question_hash: deleteHash,
                },
            ],
        });

        expect(afterDelete.questions.map((question) => question.id)).toEqual(['q-3', 'q-1']);
        expect(afterDelete.questions.map((question) => question.display_order)).toEqual([1, 2]);
    });

    it('applies archetype lifecycle operations successfully', async () => {
        const definition = makeDefinition();

        const afterCreate = await applyQuizEditPatch(definition, {
            base_definition_version: 1,
            operations: [
                {
                    op: 'create_archetype',
                    archetype: makeMainArchetype('main-c', 4, 'trait-b'),
                    after_archetype_id: 'main-b',
                },
            ],
        });

        expect(afterCreate.display_config.archetypes.map((archetype) => archetype.id)).toEqual([
            'main-a',
            'main-b',
            'main-c',
            'sub-a',
        ]);

        const afterReplace = await applyQuizEditPatch(afterCreate, {
            base_definition_version: 1,
            operations: [
                {
                    op: 'replace_archetype',
                    archetype_id: 'main-c',
                    archetype: makeMainArchetype('main-c', 3, 'trait-b', {
                        name: 'Main C Updated',
                        description: 'Updated main C',
                    }),
                },
            ],
        });

        expect(afterReplace.display_config.archetypes.find((archetype) => archetype.id === 'main-c')).toMatchObject({
            name: 'Main C Updated',
            description: 'Updated main C',
        });

        const afterReorder = await applyQuizEditPatch(afterReplace, {
            base_definition_version: 1,
            operations: [
                {
                    op: 'reorder_archetypes',
                    archetype_ids: ['main-c', 'main-a', 'main-b', 'sub-a'],
                },
            ],
        });

        expect(afterReorder.display_config.archetypes.map((archetype) => archetype.id)).toEqual([
            'main-c',
            'main-a',
            'main-b',
            'sub-a',
        ]);
        expect(afterReorder.display_config.archetypes.map((archetype) => archetype.display_order)).toEqual([
            1,
            2,
            3,
            4,
        ]);

        const afterDelete = await applyQuizEditPatch(afterReorder, {
            base_definition_version: 1,
            operations: [
                {
                    op: 'delete_archetype',
                    archetype_id: 'sub-a',
                },
            ],
        });

        expect(afterDelete.display_config.archetypes.map((archetype) => archetype.id)).toEqual([
            'main-c',
            'main-a',
            'main-b',
        ]);
    });

    it.each([
        {
            name: 'duplicate question create',
            run: async () =>
                applyQuizEditPatch(makeDefinition(), {
                    base_definition_version: 1,
                    operations: [
                        {
                            op: 'create_question',
                            question: makeQuestion('q-1', 3, 2),
                        },
                    ],
                }),
            message: 'Question q-1 already exists.',
        },
        {
            name: 'question insertion with missing anchor',
            run: async () =>
                applyQuizEditPatch(makeDefinition(), {
                    base_definition_version: 1,
                    operations: [
                        {
                            op: 'create_question',
                            question: makeQuestion('q-3', 3, 2),
                            before_question_id: 'missing-question',
                        },
                    ],
                }),
            message: 'Question missing-question was not found for insertion.',
        },
        {
            name: 'stale replace_question hash',
            run: async () => {
                const definition = makeDefinition();
                return applyQuizEditPatch(definition, {
                    base_definition_version: 1,
                    operations: [
                        {
                            op: 'replace_question',
                            question_id: 'q-1',
                            old_question_hash: '0'.repeat(64),
                            question: makeQuestion('q-1', 1, 2, { prompt: 'Changed' }),
                        },
                    ],
                });
            },
            message: 'Question q-1 has changed since the patch was created.',
        },
        {
            name: 'stale delete_question hash',
            run: async () =>
                applyQuizEditPatch(makeDefinition(), {
                    base_definition_version: 1,
                    operations: [
                        {
                            op: 'delete_question',
                            question_id: 'q-1',
                            old_question_hash: '0'.repeat(64),
                        },
                    ],
                }),
            message: 'Question q-1 has changed since the patch was created.',
        },
        {
            name: 'replace_question id mismatch',
            run: async () => {
                const definition = makeDefinition();
                const oldHash = await hashQuestion(definition.questions[0]!);
                return applyQuizEditPatch(definition, {
                    base_definition_version: 1,
                    operations: [
                        {
                            op: 'replace_question',
                            question_id: 'q-1',
                            old_question_hash: oldHash,
                            question: makeQuestion('q-2', 1, 2),
                        },
                    ],
                });
            },
            message: 'Replacement question.id must match question_id.',
        },
        {
            name: 'invalid reorder_questions set',
            run: async () =>
                applyQuizEditPatch(makeDefinition(), {
                    base_definition_version: 1,
                    operations: [
                        {
                            op: 'reorder_questions',
                            question_ids: ['q-1', 'q-1'],
                        },
                    ],
                }),
            message: 'reorder_questions must contain exactly the current set of question IDs.',
        },
        {
            name: 'set_traits after questions exist',
            run: async () =>
                applyQuizEditPatch(makeDefinition(), {
                    base_definition_version: 1,
                    operations: [
                        {
                            op: 'set_traits',
                            traits: [makeTrait('trait-a', 1)],
                        },
                    ],
                }),
            message: 'Traits cannot be replaced after questions exist.',
        },
        {
            name: 'reorder_traits after questions exist',
            run: async () =>
                applyQuizEditPatch(makeDefinition(), {
                    base_definition_version: 1,
                    operations: [
                        {
                            op: 'reorder_traits',
                            trait_ids: ['trait-b', 'trait-a'],
                        },
                    ],
                }),
            message: 'Traits cannot be reordered after questions exist.',
        },
        {
            name: 'update unknown trait text',
            run: async () =>
                applyQuizEditPatch(makeDefinition(), {
                    base_definition_version: 1,
                    operations: [
                        {
                            op: 'update_trait_text',
                            trait_id: 'missing-trait',
                            label: 'Missing',
                        },
                    ],
                }),
            message: 'Trait missing-trait does not exist.',
        },
        {
            name: 'duplicate archetype create',
            run: async () =>
                applyQuizEditPatch(makeDefinition(), {
                    base_definition_version: 1,
                    operations: [
                        {
                            op: 'create_archetype',
                            archetype: makeMainArchetype('main-a', 4),
                        },
                    ],
                }),
            message: 'Archetype main-a already exists.',
        },
        {
            name: 'archetype insertion with missing anchor',
            run: async () =>
                applyQuizEditPatch(makeDefinition(), {
                    base_definition_version: 1,
                    operations: [
                        {
                            op: 'create_archetype',
                            archetype: makeMainArchetype('main-c', 4),
                            before_archetype_id: 'missing-archetype',
                        },
                    ],
                }),
            message: 'Archetype missing-archetype was not found for insertion.',
        },
        {
            name: 'replace missing archetype',
            run: async () =>
                applyQuizEditPatch(makeDefinition(), {
                    base_definition_version: 1,
                    operations: [
                        {
                            op: 'replace_archetype',
                            archetype_id: 'missing-archetype',
                            archetype: makeMainArchetype('missing-archetype', 4),
                        },
                    ],
                }),
            message: 'Archetype missing-archetype does not exist.',
        },
        {
            name: 'replace_archetype id mismatch',
            run: async () =>
                applyQuizEditPatch(makeDefinition(), {
                    base_definition_version: 1,
                    operations: [
                        {
                            op: 'replace_archetype',
                            archetype_id: 'main-a',
                            archetype: makeMainArchetype('main-b', 1),
                        },
                    ],
                }),
            message: 'Replacement archetype.id must match archetype_id.',
        },
        {
            name: 'invalid reorder_archetypes set',
            run: async () =>
                applyQuizEditPatch(makeDefinition(), {
                    base_definition_version: 1,
                    operations: [
                        {
                            op: 'reorder_archetypes',
                            archetype_ids: ['main-a', 'main-a', 'sub-a'],
                        },
                    ],
                }),
            message: 'reorder_archetypes must contain exactly the current set of archetype IDs.',
        },
        {
            name: 'post-mutation invalid definition rejected at final parse',
            run: async () =>
                applyQuizEditPatch(makeDefinition(), {
                    base_definition_version: 1,
                    operations: [
                        {
                            op: 'replace_display_config',
                            display_config: {
                                trait_polarity: 'bidirectional',
                                archetypes: [
                                    makeMainArchetype('main-a', 1, 'missing-trait'),
                                ],
                            },
                        },
                    ],
                }),
            message: 'Archetype main-a references unknown trait missing-trait.',
        },
    ])('rejects $name', async ({ run, message }) => {
        await expect(run()).rejects.toThrow(message);
    });
});