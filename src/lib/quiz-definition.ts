import { z } from 'zod';

import { sha256Hex } from './admin-token';

const uniqueValues = (values: string[]) => new Set(values).size === values.length;

export class QuizEditValidationError extends Error {
    issues: string[];

    constructor(message: string, issues: string[] = []) {
        super(message);
        this.name = 'QuizEditValidationError';
        this.issues = issues;
    }
}

export const traitSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().default(''),
    low_label: z.string().min(1),
    high_label: z.string().min(1),
    display_order: z.number().int().positive(),
});

export const responseOptionSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    help_text: z.string().default(''),
    value: z.number(),
    display_order: z.number().int().positive(),
});

export const matrixSchema = z.object({
    rows: z.number().int().positive(),
    cols: z.number().int().positive(),
    layout: z.literal('row_major'),
    values: z.array(z.number()),
});

export const scoringConfigSchema = z
    .object({
        prior_info: z.number().positive().default(1),
    })
    .passthrough();

export const displayConfigSchema = z
    .object({
        intro_markdown: z.string().optional(),
        completion_markdown: z.string().optional(),
        result_scale_min: z.number().optional(),
        result_scale_max: z.number().optional(),
    })
    .passthrough();

export const questionSchema = z.object({
    id: z.string().min(1),
    kind: z.literal('single_choice'),
    prompt: z.string().min(1),
    help_text: z.string().default(''),
    responses: z.array(responseOptionSchema).min(2),
    score_matrix: matrixSchema,
    information_matrix: matrixSchema,
    tags: z.array(z.string()).default([]),
    active: z.boolean().default(true),
    adaptive_eligible: z.boolean().default(true),
    display_order: z.number().int().positive(),
});

export const quizDefinitionSchema = z
    .object({
        schema_version: z.number().int().positive(),
        definition_version: z.number().int().positive(),
        title: z.string().min(1),
        description: z.string().default(''),
        traits: z.array(traitSchema).min(1),
        questions: z.array(questionSchema).min(1),
        scoring_config: scoringConfigSchema,
        display_config: displayConfigSchema,
    })
    .superRefine((definition, ctx) => {
        const traitIds = definition.traits.map((trait) => trait.id);
        if (!uniqueValues(traitIds)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Trait IDs must be unique.' });
        }

        const questionIds = definition.questions.map((question) => question.id);
        if (!uniqueValues(questionIds)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Question IDs must be unique.' });
        }

        const traitCount = definition.traits.length;

        for (const question of definition.questions) {
            const responseIds = question.responses.map((response) => response.id);
            if (!uniqueValues(responseIds)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Response IDs must be unique within question ${question.id}.`,
                });
            }

            const expectedRows = question.responses.length;
            const expectedCols = traitCount;
            const expectedValues = expectedRows * expectedCols;

            for (const [matrixName, matrix] of [
                ['score_matrix', question.score_matrix] as const,
                ['information_matrix', question.information_matrix] as const,
            ]) {
                if (matrix.rows !== expectedRows || matrix.cols !== expectedCols) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `${matrixName} shape for question ${question.id} must match responses x traits.`,
                    });
                }

                if (matrix.values.length !== expectedValues) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `${matrixName} values length for question ${question.id} must equal rows * cols.`,
                    });
                }
            }
        }
    });

export const createQuestionSchema = z
    .object({
        op: z.literal('create_question'),
        question: questionSchema,
        before_question_id: z.string().min(1).optional(),
        after_question_id: z.string().min(1).optional(),
    })
    .strict()
    .superRefine((operation, ctx) => {
        if (operation.before_question_id && operation.after_question_id) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'create_question cannot specify both before_question_id and after_question_id.',
            });
        }
    });

export const replaceQuestionSchema = z
    .object({
        op: z.literal('replace_question'),
        question_id: z.string().min(1),
        old_question_hash: z.string().length(64),
        question: questionSchema,
    })
    .strict();

export const deleteQuestionSchema = z
    .object({
        op: z.literal('delete_question'),
        question_id: z.string().min(1),
        old_question_hash: z.string().length(64),
    })
    .strict();

export const reorderQuestionsSchema = z
    .object({
        op: z.literal('reorder_questions'),
        question_ids: z.array(z.string().min(1)).min(1),
    })
    .strict();

export const updateQuizMetadataSchema = z
    .object({
        op: z.literal('update_quiz_metadata'),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        display_config: displayConfigSchema.optional(),
    })
    .strict();

export const quizEditOperationSchema = z.union([
    createQuestionSchema,
    replaceQuestionSchema,
    deleteQuestionSchema,
    reorderQuestionsSchema,
    updateQuizMetadataSchema,
]);

export const quizEditPatchSchema = z
    .object({
        base_definition_version: z.number().int().positive(),
        operations: z.array(quizEditOperationSchema).min(1),
    })
    .strict();

export type Trait = z.infer<typeof traitSchema>;
export type ResponseOption = z.infer<typeof responseOptionSchema>;
export type Matrix = z.infer<typeof matrixSchema>;
export type Question = z.infer<typeof questionSchema>;
export type ScoringConfig = z.infer<typeof scoringConfigSchema>;
export type DisplayConfig = z.infer<typeof displayConfigSchema>;
export type QuizDefinition = z.infer<typeof quizDefinitionSchema>;
export type QuizEditPatch = z.infer<typeof quizEditPatchSchema>;
export type QuizEditOperation = z.infer<typeof quizEditOperationSchema>;

const normalizeQuestionOrdering = (questions: Question[]): Question[] => {
    return questions.map((question, index) => ({
        ...question,
        display_order: index + 1,
    }));
};

const stableStringify = (value: unknown): string => {
    if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
    }

    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
            left.localeCompare(right)
        );

        return `{${entries
            .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
            .join(',')}}`;
    }

    return JSON.stringify(value);
};

export const hashQuestion = async (question: Question): Promise<string> => {
    return sha256Hex(stableStringify(question));
};

export const assertStandaloneQuestion = (question: Question, traitCount: number): Question => {
    const parsedQuestion = questionSchema.parse(question);
    const expectedRows = parsedQuestion.responses.length;
    const expectedCols = traitCount;
    const expectedValues = expectedRows * expectedCols;

    for (const [matrixName, matrix] of [
        ['score_matrix', parsedQuestion.score_matrix] as const,
        ['information_matrix', parsedQuestion.information_matrix] as const,
    ]) {
        if (matrix.rows !== expectedRows || matrix.cols !== expectedCols || matrix.values.length !== expectedValues) {
            throw new QuizEditValidationError(
                `Question ${parsedQuestion.id} has an invalid ${matrixName} shape for the current trait set.`
            );
        }
    }

    return parsedQuestion;
};

export const createDefaultQuizDefinition = (title: string, description = ''): QuizDefinition => {
    const definition: QuizDefinition = {
        schema_version: 1,
        definition_version: 1,
        title,
        description,
        traits: [
            {
                id: 'structure_appetite',
                label: 'Structure Appetite',
                description: 'How much predictable structure and planning a person prefers.',
                low_label: 'Spontaneous',
                high_label: 'Structured',
                display_order: 1,
            },
        ],
        questions: [
            {
                id: 'starter_structure_question',
                kind: 'single_choice',
                prompt: 'When starting something together, what feels best?',
                help_text: 'Replace this starter question with your real quiz content.',
                responses: [
                    {
                        id: 'starter_structure_loose',
                        label: 'Figure it out as we go',
                        help_text: '',
                        value: -1,
                        display_order: 1,
                    },
                    {
                        id: 'starter_structure_planned',
                        label: 'Have a clear plan first',
                        help_text: '',
                        value: 1,
                        display_order: 2,
                    },
                ],
                score_matrix: {
                    rows: 2,
                    cols: 1,
                    layout: 'row_major',
                    values: [-1, 1],
                },
                information_matrix: {
                    rows: 2,
                    cols: 1,
                    layout: 'row_major',
                    values: [1, 1],
                },
                tags: ['starter'],
                active: true,
                adaptive_eligible: true,
                display_order: 1,
            },
        ],
        scoring_config: {
            prior_info: 1,
        },
        display_config: {
            intro_markdown: 'Replace this starter definition with your real quiz.',
        },
    };

    return quizDefinitionSchema.parse(definition);
};

export const applyQuizEditPatch = async (
    definition: QuizDefinition,
    patch: QuizEditPatch
): Promise<QuizDefinition> => {
    const parsedDefinition = quizDefinitionSchema.parse(definition);
    const parsedPatch = quizEditPatchSchema.parse(patch);
    let nextDefinition: QuizDefinition = structuredClone(parsedDefinition);

    for (const operation of parsedPatch.operations) {
        switch (operation.op) {
            case 'create_question': {
                const question = assertStandaloneQuestion(operation.question, nextDefinition.traits.length);
                if (nextDefinition.questions.some((existingQuestion) => existingQuestion.id === question.id)) {
                    throw new QuizEditValidationError(`Question ${question.id} already exists.`);
                }

                let insertAt = nextDefinition.questions.length;

                if (operation.before_question_id) {
                    insertAt = nextDefinition.questions.findIndex(
                        (existingQuestion) => existingQuestion.id === operation.before_question_id
                    );
                    if (insertAt === -1) {
                        throw new QuizEditValidationError(
                            `Question ${operation.before_question_id} was not found for insertion.`
                        );
                    }
                } else if (operation.after_question_id) {
                    insertAt =
                        nextDefinition.questions.findIndex(
                            (existingQuestion) => existingQuestion.id === operation.after_question_id
                        ) + 1;
                    if (insertAt === 0) {
                        throw new QuizEditValidationError(
                            `Question ${operation.after_question_id} was not found for insertion.`
                        );
                    }
                }

                const questions = [...nextDefinition.questions];
                questions.splice(insertAt, 0, question);
                nextDefinition.questions = normalizeQuestionOrdering(questions);
                break;
            }

            case 'replace_question': {
                const questionIndex = nextDefinition.questions.findIndex(
                    (question) => question.id === operation.question_id
                );
                if (questionIndex === -1) {
                    throw new QuizEditValidationError(`Question ${operation.question_id} does not exist.`);
                }

                const currentQuestion = nextDefinition.questions[questionIndex];
                const currentHash = await hashQuestion(currentQuestion);
                if (currentHash !== operation.old_question_hash) {
                    throw new QuizEditValidationError(
                        `Question ${operation.question_id} has changed since the patch was created.`
                    );
                }

                if (operation.question.id !== operation.question_id) {
                    throw new QuizEditValidationError('Replacement question.id must match question_id.');
                }

                const replacement = assertStandaloneQuestion(operation.question, nextDefinition.traits.length);
                const questions = [...nextDefinition.questions];
                questions[questionIndex] = replacement;
                nextDefinition.questions = normalizeQuestionOrdering(questions);
                break;
            }

            case 'delete_question': {
                const questionIndex = nextDefinition.questions.findIndex(
                    (question) => question.id === operation.question_id
                );
                if (questionIndex === -1) {
                    throw new QuizEditValidationError(`Question ${operation.question_id} does not exist.`);
                }

                const currentQuestion = nextDefinition.questions[questionIndex];
                const currentHash = await hashQuestion(currentQuestion);
                if (currentHash !== operation.old_question_hash) {
                    throw new QuizEditValidationError(
                        `Question ${operation.question_id} has changed since the patch was created.`
                    );
                }

                nextDefinition.questions = normalizeQuestionOrdering(
                    nextDefinition.questions.filter((question) => question.id !== operation.question_id)
                );

                if (nextDefinition.questions.length === 0) {
                    throw new QuizEditValidationError('A quiz definition must contain at least one question.');
                }
                break;
            }

            case 'reorder_questions': {
                const currentIds = nextDefinition.questions.map((question) => question.id);
                const requestedIds = operation.question_ids;

                if (
                    currentIds.length !== requestedIds.length ||
                    !uniqueValues(requestedIds) ||
                    currentIds.some((questionId) => !requestedIds.includes(questionId))
                ) {
                    throw new QuizEditValidationError(
                        'reorder_questions must contain exactly the current set of question IDs.'
                    );
                }

                const lookup = new Map(nextDefinition.questions.map((question) => [question.id, question]));
                nextDefinition.questions = normalizeQuestionOrdering(
                    requestedIds.map((questionId) => lookup.get(questionId) as Question)
                );
                break;
            }

            case 'update_quiz_metadata': {
                nextDefinition = {
                    ...nextDefinition,
                    title: operation.title ?? nextDefinition.title,
                    description: operation.description ?? nextDefinition.description,
                    display_config: operation.display_config ?? nextDefinition.display_config,
                };
                break;
            }
        }
    }

    return quizDefinitionSchema.parse(nextDefinition);
};