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

export const traitSchema = z
    .object({
        id: z.string().min(1).meta({ description: 'Stable machine-readable trait identifier.' }),
        label: z.string().min(1).meta({ description: 'Human-facing trait label.' }),
        description: z.string().default('').meta({ description: 'Optional explanatory text for the trait.' }),
        low_label: z.string().min(1).meta({ description: 'Label shown for the low end of the trait scale.' }),
        high_label: z.string().min(1).meta({ description: 'Label shown for the high end of the trait scale.' }),
        display_order: z.number().int().positive().meta({ description: '1-based display order for rendering.' }),
    })
    .meta({
        description: 'One measured trait axis in the quiz definition.',
        docs: {
            notes: ['Trait order defines the matrix column order for every question.'],
        },
    });

export const responseOptionSchema = z
    .object({
        id: z.string().min(1).meta({ description: 'Stable machine-readable response identifier.' }),
        label: z.string().min(1).meta({ description: 'Human-facing answer label.' }),
        help_text: z.string().default('').meta({ description: 'Optional helper text shown with the response.' }),
        value: z.number().meta({ description: 'Response value preserved in the definition payload.' }),
        display_order: z.number().int().positive().meta({ description: '1-based display order within the question.' }),
    })
    .meta({
        description: 'A single answer choice for a single-choice question.',
        docs: {
            notes: ['Response order defines the row order used by the question matrices.'],
        },
    });

export const matrixSchema = z
    .object({
        rows: z.number().int().positive().meta({ description: 'Number of matrix rows.' }),
        cols: z.number().int().positive().meta({ description: 'Number of matrix columns.' }),
        layout: z.literal('row_major').meta({ description: 'Matrix storage layout. Only row_major is accepted in v1.' }),
        values: z.array(z.number()).meta({ description: 'Flattened matrix values in row-major order.' }),
    })
    .meta({
        description: 'A flattened numeric matrix used for per-response per-trait weights.',
        docs: {
            notes: ['Indexing rule: values[response_index * trait_count + trait_index].'],
        },
    });
export const questionOrderingSchema = z
    .enum(['ordered', 'random', 'adaptive'])
    .meta({
        description: 'Controls how questions are sequenced during a quiz session. ordered: display_order sequence; random: session-stable shuffle; adaptive: information-driven selection.',
    });

export type QuestionOrdering = z.infer<typeof questionOrderingSchema>;

export const adaptiveSelectionConfigSchema = z
    .object({
        target_info: z.array(z.number().nonnegative()).meta({ description: 'Per-trait target information level. Length must equal trait count.' }),
        trait_priority: z.array(z.number().nonnegative()).meta({ description: 'Per-trait priority multiplier applied to need. Length must equal trait count.' }),
        min_questions: z.number().int().positive().default(10).meta({ description: 'Minimum questions answered before early-stop rules apply.' }),
        max_questions: z.number().int().positive().default(30).meta({ description: 'Hard upper limit on questions presented.' }),
        candidate_pool_size: z.number().int().positive().default(12).meta({ description: 'Number of top-scored questions to retain before greedy diversity selection.' }),
        candidate_count: z.number().int().positive().default(3).meta({ description: 'Candidate batch size returned per selection cycle.' }),
        need_power: z.number().positive().default(1.25).meta({ description: 'Exponent applied to deficit ratio when computing the need vector.' }),
        uncertainty_weight: z.number().nonnegative().default(0.20).meta({ description: 'Weight applied to the uncertainty term in the need vector.' }),
        contradiction_followup_weight: z.number().nonnegative().default(0.35).meta({ description: 'Weight applied to contradiction follow-up pressure in the need vector.' }),
        contradiction_target: z.array(z.number().positive()).meta({ description: 'Per-trait target contradiction level for follow-up scaling. Length must equal trait count.' }),
        axis_purity_min: z.number().min(0).max(1).default(0.35).meta({ description: 'Minimum cosine similarity between expected-info and need vectors for a question to be a strong candidate.' }),
        off_axis_penalty: z.number().nonnegative().default(0.25).meta({ description: 'Penalty multiplier for questions that over-load already-saturated traits.' }),
        recent_window: z.number().int().positive().default(5).meta({ description: 'Number of most-recently answered questions considered for redundancy penalty.' }),
        recent_redundancy_penalty: z.number().nonnegative().default(0.20).meta({ description: 'Penalty multiplier for cosine similarity to recently answered questions.' }),
        skipped_penalty: z.number().nonnegative().default(0.75).meta({ description: 'Raw score penalty applied to questions previously skipped in this session.' }),
        batch_diversity_penalty: z.number().nonnegative().default(0.25).meta({ description: 'Greedy batch diversity penalty multiplier for similarity to already-selected candidates.' }),
        min_goodness_to_ask: z.number().min(0).max(1).default(0.10).meta({ description: 'Normalized goodness threshold below which a question is considered a weak candidate. Used in post-minimum stopping.' }),
    })
    .meta({
        description: 'Configuration for adaptive question selection. All vectors must align with the quiz trait order.',
        docs: {
            notes: [
                'target_info, trait_priority, and contradiction_target must each have length equal to trait count.',
                'Adaptive selection chooses questions by computing a need vector and scoring candidates against expected information gain.',
            ],
        },
    });

export type AdaptiveSelectionConfig = z.infer<typeof adaptiveSelectionConfigSchema>;

export const scoringConfigSchema = z
    .looseObject({
        prior_info: z.number().positive().default(1).meta({ description: 'Default prior information value used by adaptive scoring.' }),
        adaptive_selection: adaptiveSelectionConfigSchema.optional().meta({ description: 'Adaptive question selection configuration. Required when question_ordering is adaptive.' }),
    })
    .meta({
        description: 'Scoring-related configuration for the whole quiz definition.',
    });

export const archetypeTraitConditionSchema = z
    .strictObject({
        trait_id: z.string().min(1).meta({ description: 'Trait id this condition applies to.' }),
        score_min: z.number().optional().meta({ description: 'Optional inclusive lower bound for trait estimate.' }),
        score_max: z.number().optional().meta({ description: 'Optional inclusive upper bound for trait estimate.' }),
        contradiction_min: z.number().optional().meta({ description: 'Optional inclusive lower bound for trait contradiction.' }),
        contradiction_max: z.number().optional().meta({ description: 'Optional inclusive upper bound for trait contradiction.' }),
    })
    .meta({
        description: 'One trait-level matching rule for an archetype.',
    });

export const archetypeVariantSchema = z
    .strictObject({
        name: z.string().min(1).meta({ description: 'Variant name shown when this subtype is paired with the keyed main archetype.' }),
        description: z.string().min(1).meta({ description: 'Variant description shown when this subtype is paired with the keyed main archetype.' }),
    })
    .meta({
        description: 'Subtype display variant keyed by main archetype id.',
    });

export const archetypeSchema = z
    .strictObject({
        id: z.string().min(1).meta({ description: 'Stable machine-readable archetype identifier.' }),
        name: z.string().min(1).meta({ description: 'Human-facing archetype name.' }),
        description: z.string().min(1).meta({ description: 'Human-facing archetype description prose.' }),
        icon: z.string().max(16).optional().meta({ description: 'Optional unicode icon string for display.' }),
        is_main: z.boolean().meta({ description: 'True for main archetypes, false for subtypes.' }),
        trait_conditions: z.array(archetypeTraitConditionSchema).min(1).meta({ description: 'All listed conditions must pass for this archetype to match.' }),
        compatibility_mode: z.enum(['allow-list', 'incompatibility-list']).optional().meta({ description: 'Subtype compatibility mode against main archetype ids.' }),
        compatibility_main_archetype_ids: z.array(z.string().min(1)).default([]).meta({ description: 'Main archetype ids used by compatibility_mode for subtypes.' }),
        variants_by_main_archetype_id: z.record(z.string().min(1), archetypeVariantSchema).default({}).meta({ description: 'Optional subtype variant overrides keyed by main archetype id.' }),
        display_order: z.number().int().positive().meta({ description: '1-based display and matching order for archetype traversal.' }),
    })
    .superRefine((archetype, ctx) => {
        if (!archetype.is_main && archetype.compatibility_mode && archetype.compatibility_main_archetype_ids.length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Subtype archetype ${archetype.id} must include compatibility_main_archetype_ids when compatibility_mode is set.`,
            });
        }

        if (archetype.is_main && archetype.compatibility_mode) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Main archetype ${archetype.id} cannot define compatibility_mode.`,
            });
        }

        if (archetype.is_main && archetype.compatibility_main_archetype_ids.length > 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Main archetype ${archetype.id} cannot define compatibility_main_archetype_ids.`,
            });
        }
    })
    .meta({
        description: 'Main archetype or subtype definition used for result classification.',
    });

const hexColorSchema = z
    .string()
    .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, {
        message: 'Theme colors must be hex values like #RRGGBB or #RRGGBBAA.',
    });

export const themeColorsSchema = z
    .strictObject({
        page_background: hexColorSchema.optional().meta({ description: 'Page background color for respondent screens.' }),
        panel_background: hexColorSchema.optional().meta({ description: 'Primary panel/surface background color.' }),
        panel_border: hexColorSchema.optional().meta({ description: 'Primary panel border color.' }),
        heading_text: hexColorSchema.optional().meta({ description: 'Heading text color.' }),
        body_text: hexColorSchema.optional().meta({ description: 'Body text color.' }),
        muted_text: hexColorSchema.optional().meta({ description: 'Muted/supporting text color.' }),
        accent: hexColorSchema.optional().meta({ description: 'Primary accent color for buttons and emphasis.' }),
        accent_text: hexColorSchema.optional().meta({ description: 'Foreground text color shown on accent surfaces.' }),
        chart_positive: hexColorSchema.optional().meta({ description: 'Positive/result-forward chart color token.' }),
        chart_negative: hexColorSchema.optional().meta({ description: 'Negative/result-backward chart color token.' }),
        chart_grid: hexColorSchema.optional().meta({ description: 'Chart grid/axis line color token.' }),
        chart_band: hexColorSchema.optional().meta({ description: 'Chart spread/band color token.' }),
    })
    .meta({
        description: 'Optional fixed-key theme colors used to style respondent-facing UI.',
        docs: {
            notes: [
                'All theme color fields are optional; absent values fall back to the default UI palette.',
                'Custom themes can be created by setting theme_colors directly via replace_display_config.',
            ],
        },
    });

export const displayConfigSchema = z
    .looseObject({
        intro_markdown: z.string().optional().meta({ description: 'Markdown shown before the quiz starts.' }),
        completion_markdown: z.string().optional().meta({ description: 'Markdown shown after the quiz is completed.' }),
        result_scale_min: z.number().optional().meta({ description: 'Optional lower bound for result display scaling.' }),
        result_scale_max: z.number().optional().meta({ description: 'Optional upper bound for result display scaling.' }),
        trait_polarity: z.enum(['bidirectional', 'unidirectional']).default('bidirectional').meta({ description: 'Whether traits display as bidirectional scales (centered) or unidirectional (0 to max).' }),
        archetypes: z.array(archetypeSchema).default([]).meta({ description: 'Ordered archetype and subtype definitions used for result classification.' }),
        archetype_name_template: z.string().min(1).optional().meta({ description: 'Optional Mustache template for combining matched main and subtype archetype names. Available placeholders: {{main}}, {{sub}}, {{main_archetype_name}}, and {{sub_archetype_name}}.' }),
        theme_colors: themeColorsSchema.optional().meta({ description: 'Optional respondent UI theme color overrides.' }),
    })
    .meta({
        description: 'Display-oriented configuration for quiz presentation.',
        docs: {
            notes: [
                'When a main archetype and subtype both match, archetype_name_template renders the combined result name with Mustache. If omitted, the display falls back to "Main (Subtype)".',
                'The template is ignored for main-only results, which display the main archetype name.',
            ],
        },
    });

export const questionSchema = z
    .object({
        id: z.string().min(1).meta({ description: 'Stable machine-readable question identifier.' }),
        kind: z.literal('single_choice').meta({ description: 'Question kind. Only single_choice is accepted in v1.' }),
        prompt: z.string().min(1).meta({ description: 'Question prompt shown to the participant.' }),
        help_text: z.string().default('').meta({ description: 'Optional helper text shown with the question.' }),
        responses: z.array(responseOptionSchema).min(2).meta({ description: 'Ordered response options for the question.' }),
        score_matrix: matrixSchema,
        information_matrix: matrixSchema,
        tags: z.array(z.string()).default([]).meta({ description: 'Optional freeform tags for filtering or tooling.' }),
        active: z.boolean().default(true).meta({ description: 'Whether the question is active in the definition.' }),
        adaptive_eligible: z.boolean().default(true).meta({ description: 'Whether the question may be used by adaptive selection logic.' }),
        display_order: z.number().int().positive().meta({ description: '1-based display order within the quiz.' }),
    })
    .meta({
        description: 'A single v1 quiz question.',
        docs: {
            notes: [
                'Question responses, score_matrix rows, and information_matrix rows must stay aligned.',
                'score_matrix and information_matrix both use the Matrix indexing rule.',
            ],
        },
    });

export const quizDefinitionSchema = z
    .object({
        schema_version: z.number().int().positive().meta({ description: 'Quiz definition schema version.' }),
        definition_version: z.number().int().positive().meta({ description: 'Monotonic version for the current definition snapshot.' }),
        title: z.string().min(1).meta({ description: 'Human-facing quiz title.' }),
        description: z.string().default('').meta({ description: 'Optional quiz description.' }),
        question_ordering: questionOrderingSchema.default('ordered').meta({ description: 'Controls how questions are sequenced during a quiz session.' }),
        traits: z.array(traitSchema).meta({ description: 'Ordered trait definitions used by all questions.' }),
        questions: z.array(questionSchema).meta({ description: 'Ordered question definitions in the quiz.' }),
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
        const archetypeIds = definition.display_config.archetypes.map((archetype) => archetype.id);
        const mainArchetypeIds = definition.display_config.archetypes
            .filter((archetype) => archetype.is_main)
            .map((archetype) => archetype.id);

        if (!uniqueValues(archetypeIds)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Archetype IDs must be unique.' });
        }

        if (definition.scoring_config.adaptive_selection) {
            const cfg = definition.scoring_config.adaptive_selection;
            const vectorFields = [
                ['target_info', cfg.target_info],
                ['trait_priority', cfg.trait_priority],
                ['contradiction_target', cfg.contradiction_target],
            ] as const;

            for (const [fieldName, vec] of vectorFields) {
                if (vec.length !== traitCount) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `scoring_config.adaptive_selection.${fieldName} length (${vec.length}) must equal trait count (${traitCount}).`,
                    });
                }
            }

            if (cfg.min_questions >= cfg.max_questions) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'scoring_config.adaptive_selection.min_questions must be less than max_questions.',
                });
            }
        }

        if (definition.questions.length > 0 && traitCount === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Questions cannot be defined until at least one trait exists.',
            });
        }

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

        for (const archetype of definition.display_config.archetypes) {
            for (const condition of archetype.trait_conditions) {
                if (!traitIds.includes(condition.trait_id)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `Archetype ${archetype.id} references unknown trait ${condition.trait_id}.`,
                    });
                }

                if (
                    condition.score_min !== undefined &&
                    condition.score_max !== undefined &&
                    condition.score_min > condition.score_max
                ) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `Archetype ${archetype.id} has score_min greater than score_max for trait ${condition.trait_id}.`,
                    });
                }

                if (
                    condition.contradiction_min !== undefined &&
                    condition.contradiction_max !== undefined &&
                    condition.contradiction_min > condition.contradiction_max
                ) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `Archetype ${archetype.id} has contradiction_min greater than contradiction_max for trait ${condition.trait_id}.`,
                    });
                }
            }

            if (!archetype.is_main) {
                for (const mainId of archetype.compatibility_main_archetype_ids) {
                    if (!mainArchetypeIds.includes(mainId)) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: `Subtype archetype ${archetype.id} references unknown main archetype ${mainId}.`,
                        });
                    }
                }

                for (const variantMainId of Object.keys(archetype.variants_by_main_archetype_id)) {
                    if (!mainArchetypeIds.includes(variantMainId)) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: `Subtype archetype ${archetype.id} defines variant for unknown main archetype ${variantMainId}.`,
                        });
                    }
                }
            } else if (Object.keys(archetype.variants_by_main_archetype_id).length > 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Main archetype ${archetype.id} cannot define variants_by_main_archetype_id.`,
                });
            }
        }
    })
    .meta({
        description: 'The full current quiz definition stored and edited by the admin flow.',
        docs: {
            crossFieldRules: [
                'Empty quizzes are valid initial definitions.',
                'Trait IDs must be unique.',
                'Question IDs must be unique.',
                'Questions cannot be defined until at least one trait exists.',
                'Response IDs must be unique within each question.',
                'Each question matrix shape must match responses x traits.',
                'Each question matrix values length must equal rows * cols.',
            ],
        },
    });

export const createQuestionSchema = z
    .strictObject({
        op: z.literal('create_question'),
        question: questionSchema,
        before_question_id: z.string().min(1).optional(),
        after_question_id: z.string().min(1).optional(),
    })
    .superRefine((operation, ctx) => {
        if (operation.before_question_id && operation.after_question_id) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'create_question cannot specify both before_question_id and after_question_id.',
            });
        }
    })
    .meta({
        description: 'Add a new question to the definition.',
        docs: {
            crossFieldRules: ['Cannot specify both before_question_id and after_question_id in the same operation.'],
        },
    });

export const replaceQuestionSchema = z
    .strictObject({
        op: z.literal('replace_question'),
        question_id: z.string().min(1),
        old_question_hash: z.string().length(64),
        question: questionSchema,
    })
    .meta({
        description: 'Replace an existing question using optimistic concurrency on the old hash.',
        docs: {
            crossFieldRules: ['question.id must match question_id when applying the replacement.'],
        },
    });

export const deleteQuestionSchema = z
    .strictObject({
        op: z.literal('delete_question'),
        question_id: z.string().min(1),
        old_question_hash: z.string().length(64),
    })
    .meta({
        description: 'Delete an existing question using optimistic concurrency on the old hash.',
    });

export const reorderQuestionsSchema = z
    .strictObject({
        op: z.literal('reorder_questions'),
        question_ids: z.array(z.string().min(1)).min(1),
    })
    .meta({
        description: 'Reorder the existing questions by supplying the full ordered question id set.',
        docs: {
            crossFieldRules: ['question_ids must contain exactly the current set of question IDs with no duplicates.'],
        },
    });

export const updateQuizMetadataSchema = z
    .strictObject({
        op: z.literal('update_quiz_metadata'),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        question_ordering: questionOrderingSchema.optional(),
    })
    .meta({
        description: 'Update top-level quiz metadata without changing traits or questions.',
        docs: {
            notes: ['This operation affects title, description, and question_ordering.'],
        },
    });

export const replaceDisplayConfigSchema = z
    .strictObject({
        op: z.literal('replace_display_config'),
        display_config: displayConfigSchema,
    })
    .meta({
        description: 'Replace the entire display_config object.',
        docs: {
            notes: ['This operation replaces the whole display_config object.'],
        },
    });

export const replaceScoringConfigSchema = z
    .strictObject({
        op: z.literal('replace_scoring_config'),
        scoring_config: scoringConfigSchema,
    })
    .meta({
        description: 'Replace the entire scoring_config object.',
        docs: {
            notes: [
                'This operation replaces the whole scoring_config object.',
                'It does not rewrite question matrices.',
            ],
        },
    });

export const setTraitsSchema = z
    .strictObject({
        op: z.literal('set_traits'),
        traits: z.array(traitSchema).meta({ description: 'Full replacement trait list for initial setup.' }),
    })
    .meta({
        description: 'Replace the full trait list during initial setup.',
        docs: {
            crossFieldRules: [
                'Allowed only when questions.length === 0.',
                'Trait order defines future matrix column order.',
            ],
        },
    });

export const updateTraitTextSchema = z
    .strictObject({
        op: z.literal('update_trait_text'),
        trait_id: z.string().min(1).meta({ description: 'Trait id to update in place.' }),
        label: z.string().min(1).optional(),
        description: z.string().optional(),
        low_label: z.string().min(1).optional(),
        high_label: z.string().min(1).optional(),
    })
    .meta({
        description: 'Update only trait labels and descriptions without changing trait structure.',
        docs: {
            crossFieldRules: [
                'Allowed before or after questions exist.',
                'Must not change trait id or trait order.',
                'Does not require matrix migration.',
            ],
        },
    });

export const reorderTraitsSchema = z
    .strictObject({
        op: z.literal('reorder_traits'),
        trait_ids: z.array(z.string().min(1)).meta({ description: 'Full ordered trait id list.' }),
    })
    .meta({
        description: 'Reorder the existing trait list before any questions exist.',
        docs: {
            crossFieldRules: [
                'Allowed only when questions.length === 0.',
                'trait_ids must contain exactly the current trait IDs.',
                'Changes future matrix column order.',
            ],
        },
    });

export const createArchetypeSchema = z
    .strictObject({
        op: z.literal('create_archetype'),
        archetype: archetypeSchema,
        before_archetype_id: z.string().min(1).optional(),
        after_archetype_id: z.string().min(1).optional(),
    })
    .superRefine((operation, ctx) => {
        if (operation.before_archetype_id && operation.after_archetype_id) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'create_archetype cannot specify both before_archetype_id and after_archetype_id.',
            });
        }
    });

export const replaceArchetypeSchema = z
    .strictObject({
        op: z.literal('replace_archetype'),
        archetype_id: z.string().min(1),
        archetype: archetypeSchema,
    });

export const deleteArchetypeSchema = z
    .strictObject({
        op: z.literal('delete_archetype'),
        archetype_id: z.string().min(1),
    });

export const reorderArchetypesSchema = z
    .strictObject({
        op: z.literal('reorder_archetypes'),
        archetype_ids: z.array(z.string().min(1)).min(1),
    });

export const quizEditOperationSchema = z.union([
    createQuestionSchema,
    replaceQuestionSchema,
    deleteQuestionSchema,
    reorderQuestionsSchema,
    updateQuizMetadataSchema,
    replaceDisplayConfigSchema,
    replaceScoringConfigSchema,
    setTraitsSchema,
    updateTraitTextSchema,
    reorderTraitsSchema,
    createArchetypeSchema,
    replaceArchetypeSchema,
    deleteArchetypeSchema,
    reorderArchetypesSchema,
]).meta({
    description: 'Union of all accepted quiz edit operations.',
});

export const quizEditPatchSchema = z
    .strictObject({
        base_definition_version: z.number().int().positive().meta({ description: 'Definition version the patch was authored against.' }),
        operations: z.array(quizEditOperationSchema).min(1).meta({ description: 'Ordered list of edit operations to apply.' }),
    })
    .meta({
        description: 'Patch envelope accepted by the admin edit API.',
        docs: {
            crossFieldRules: ['base_definition_version must match the current stored definition version before the patch is applied.'],
        },
    });

export type Trait = z.infer<typeof traitSchema>;
export type ResponseOption = z.infer<typeof responseOptionSchema>;
export type Matrix = z.infer<typeof matrixSchema>;
export type Question = z.infer<typeof questionSchema>;
export type ScoringConfig = z.infer<typeof scoringConfigSchema>;
export type ArchetypeTraitCondition = z.infer<typeof archetypeTraitConditionSchema>;
export type ArchetypeVariant = z.infer<typeof archetypeVariantSchema>;
export type Archetype = z.infer<typeof archetypeSchema>;
export type ThemeColors = z.infer<typeof themeColorsSchema>;
export type DisplayConfig = z.infer<typeof displayConfigSchema>;
export type QuizDefinition = z.infer<typeof quizDefinitionSchema>;
export type ReplaceDisplayConfig = z.infer<typeof replaceDisplayConfigSchema>;
export type ReplaceScoringConfig = z.infer<typeof replaceScoringConfigSchema>;
export type SetTraits = z.infer<typeof setTraitsSchema>;
export type UpdateTraitText = z.infer<typeof updateTraitTextSchema>;
export type ReorderTraits = z.infer<typeof reorderTraitsSchema>;
export type TopLevelQuizOperation =
    | z.infer<typeof updateQuizMetadataSchema>
    | ReplaceDisplayConfig
    | ReplaceScoringConfig
    | SetTraits
    | UpdateTraitText
    | ReorderTraits
    | z.infer<typeof createArchetypeSchema>
    | z.infer<typeof replaceArchetypeSchema>
    | z.infer<typeof deleteArchetypeSchema>
    | z.infer<typeof reorderArchetypesSchema>;
export type QuizEditPatch = z.infer<typeof quizEditPatchSchema>;
export type QuizEditOperation = z.infer<typeof quizEditOperationSchema>;

const normalizeTraitOrdering = (traits: Trait[]): Trait[] => {
    return traits.map((trait, index) => ({
        ...trait,
        display_order: index + 1,
    }));
};

const normalizeQuestionOrdering = (questions: Question[]): Question[] => {
    return questions.map((question, index) => ({
        ...question,
        display_order: index + 1,
    }));
};

const normalizeArchetypeOrdering = (archetypes: Archetype[]): Archetype[] => {
    return archetypes.map((archetype, index) => ({
        ...archetype,
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
    if (traitCount === 0) {
        throw new QuizEditValidationError('Questions cannot be defined until at least one trait exists.');
    }

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
        question_ordering: 'ordered',
        traits: [],
        questions: [],
        scoring_config: {
            prior_info: 1,
        },
        display_config: {
            intro_markdown: 'Configure traits before creating questions.',
            trait_polarity: 'bidirectional',
            archetypes: [],
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
                    question_ordering: operation.question_ordering ?? nextDefinition.question_ordering,
                };
                break;
            }

            case 'replace_display_config': {
                nextDefinition = {
                    ...nextDefinition,
                    display_config: operation.display_config,
                };
                break;
            }

            case 'replace_scoring_config': {
                nextDefinition = {
                    ...nextDefinition,
                    scoring_config: operation.scoring_config,
                };
                break;
            }

            case 'set_traits': {
                if (nextDefinition.questions.length > 0) {
                    throw new QuizEditValidationError('Traits cannot be replaced after questions exist.');
                }

                nextDefinition = {
                    ...nextDefinition,
                    traits: normalizeTraitOrdering(operation.traits),
                };
                break;
            }

            case 'update_trait_text': {
                const traitIndex = nextDefinition.traits.findIndex((trait) => trait.id === operation.trait_id);
                if (traitIndex === -1) {
                    throw new QuizEditValidationError(`Trait ${operation.trait_id} does not exist.`);
                }

                const traits = [...nextDefinition.traits];
                const currentTrait = traits[traitIndex];
                traits[traitIndex] = {
                    ...currentTrait,
                    label: operation.label ?? currentTrait.label,
                    description: operation.description ?? currentTrait.description,
                    low_label: operation.low_label ?? currentTrait.low_label,
                    high_label: operation.high_label ?? currentTrait.high_label,
                };

                nextDefinition = {
                    ...nextDefinition,
                    traits,
                };
                break;
            }

            case 'reorder_traits': {
                if (nextDefinition.questions.length > 0) {
                    throw new QuizEditValidationError('Traits cannot be reordered after questions exist.');
                }

                const currentIds = nextDefinition.traits.map((trait) => trait.id);
                const requestedIds = operation.trait_ids;

                if (
                    currentIds.length !== requestedIds.length ||
                    !uniqueValues(requestedIds) ||
                    currentIds.some((traitId) => !requestedIds.includes(traitId))
                ) {
                    throw new QuizEditValidationError(
                        'reorder_traits must contain exactly the current set of trait IDs.'
                    );
                }

                const lookup = new Map(nextDefinition.traits.map((trait) => [trait.id, trait]));
                nextDefinition = {
                    ...nextDefinition,
                    traits: normalizeTraitOrdering(
                        requestedIds.map((traitId) => lookup.get(traitId) as Trait)
                    ),
                };
                break;
            }

            case 'create_archetype': {
                const archetype = archetypeSchema.parse(operation.archetype);
                const currentArchetypes = nextDefinition.display_config.archetypes ?? [];

                if (currentArchetypes.some((existingArchetype) => existingArchetype.id === archetype.id)) {
                    throw new QuizEditValidationError(`Archetype ${archetype.id} already exists.`);
                }

                let insertAt = currentArchetypes.length;

                if (operation.before_archetype_id) {
                    insertAt = currentArchetypes.findIndex(
                        (existingArchetype) => existingArchetype.id === operation.before_archetype_id
                    );
                    if (insertAt === -1) {
                        throw new QuizEditValidationError(
                            `Archetype ${operation.before_archetype_id} was not found for insertion.`
                        );
                    }
                } else if (operation.after_archetype_id) {
                    insertAt =
                        currentArchetypes.findIndex(
                            (existingArchetype) => existingArchetype.id === operation.after_archetype_id
                        ) + 1;
                    if (insertAt === 0) {
                        throw new QuizEditValidationError(
                            `Archetype ${operation.after_archetype_id} was not found for insertion.`
                        );
                    }
                }

                const archetypes = [...currentArchetypes];
                archetypes.splice(insertAt, 0, archetype);

                nextDefinition = {
                    ...nextDefinition,
                    display_config: {
                        ...nextDefinition.display_config,
                        archetypes: normalizeArchetypeOrdering(archetypes),
                    },
                };
                break;
            }

            case 'replace_archetype': {
                const archetype = archetypeSchema.parse(operation.archetype);
                const currentArchetypes = nextDefinition.display_config.archetypes ?? [];
                const archetypeIndex = currentArchetypes.findIndex(
                    (entry) => entry.id === operation.archetype_id
                );

                if (archetypeIndex === -1) {
                    throw new QuizEditValidationError(`Archetype ${operation.archetype_id} does not exist.`);
                }

                if (archetype.id !== operation.archetype_id) {
                    throw new QuizEditValidationError('Replacement archetype.id must match archetype_id.');
                }

                const duplicate = currentArchetypes.find(
                    (entry, index) => entry.id === archetype.id && index !== archetypeIndex
                );
                if (duplicate) {
                    throw new QuizEditValidationError(`Archetype ${archetype.id} already exists.`);
                }

                const archetypes = [...currentArchetypes];
                archetypes[archetypeIndex] = archetype;

                nextDefinition = {
                    ...nextDefinition,
                    display_config: {
                        ...nextDefinition.display_config,
                        archetypes: normalizeArchetypeOrdering(archetypes),
                    },
                };
                break;
            }

            case 'delete_archetype': {
                const currentArchetypes = nextDefinition.display_config.archetypes ?? [];
                const archetypeIndex = currentArchetypes.findIndex(
                    (entry) => entry.id === operation.archetype_id
                );

                if (archetypeIndex === -1) {
                    throw new QuizEditValidationError(`Archetype ${operation.archetype_id} does not exist.`);
                }

                const remainingArchetypes = currentArchetypes.filter(
                    (entry) => entry.id !== operation.archetype_id
                );

                nextDefinition = {
                    ...nextDefinition,
                    display_config: {
                        ...nextDefinition.display_config,
                        archetypes: normalizeArchetypeOrdering(remainingArchetypes),
                    },
                };
                break;
            }

            case 'reorder_archetypes': {
                const currentArchetypes = nextDefinition.display_config.archetypes ?? [];
                const currentIds = currentArchetypes.map((archetype) => archetype.id);
                const requestedIds = operation.archetype_ids;

                if (
                    currentIds.length !== requestedIds.length ||
                    !uniqueValues(requestedIds) ||
                    currentIds.some((archetypeId) => !requestedIds.includes(archetypeId))
                ) {
                    throw new QuizEditValidationError(
                        'reorder_archetypes must contain exactly the current set of archetype IDs.'
                    );
                }

                const lookup = new Map(currentArchetypes.map((archetype) => [archetype.id, archetype]));
                nextDefinition = {
                    ...nextDefinition,
                    display_config: {
                        ...nextDefinition.display_config,
                        archetypes: normalizeArchetypeOrdering(
                            requestedIds.map((archetypeId) => lookup.get(archetypeId) as Archetype)
                        ),
                    },
                };
                break;
            }
        }
    }

    return quizDefinitionSchema.parse(nextDefinition);
};
