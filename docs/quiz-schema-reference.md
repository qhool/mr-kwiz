# Auto-Generated Quiz Schema Reference

Generated from the application Zod schemas and inline schema metadata.

## QuizDefinition

The full current quiz definition stored and edited by the admin flow.

| field              | type             | required | constraints  | notes                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ---------------- | -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| definition_version | number           | yes      | integer, > 0 | Monotonic version for the current definition snapshot.                                                                                                                                                                                                                                                                    |
| description        | string           | no       | default      | Optional quiz description.                                                                                                                                                                                                                                                                                                |
| display_config     | DisplayConfig    | yes      |              | Display-oriented configuration for quiz presentation. When a main archetype and subtype both match, archetype_name_template renders the combined result name with Mustache. If omitted, the display falls back to "Main (Subtype)". The template is ignored for main-only results, which display the main archetype name. |
| question_ordering  | QuestionOrdering | no       | default      | Controls how questions are sequenced during a quiz session.                                                                                                                                                                                                                                                               |
| questions          | Question[]       | yes      |              | Ordered question definitions in the quiz.                                                                                                                                                                                                                                                                                 |
| schema_version     | number           | yes      | integer, > 0 | Quiz definition schema version.                                                                                                                                                                                                                                                                                           |
| scoring_config     | ScoringConfig    | yes      |              | Scoring-related configuration for the whole quiz definition.                                                                                                                                                                                                                                                              |
| title              | string           | yes      | min length 1 | Human-facing quiz title.                                                                                                                                                                                                                                                                                                  |
| traits             | Trait[]          | yes      |              | Ordered trait definitions used by all questions.                                                                                                                                                                                                                                                                          |

## QuizEditPatch

Patch envelope accepted by the admin edit API.

| field                   | type                | required | constraints  | notes                                              |
| ----------------------- | ------------------- | -------- | ------------ | -------------------------------------------------- |
| base_definition_version | number              | yes      | integer, > 0 | Definition version the patch was authored against. |
| operations              | QuizEditOperation[] | yes      | min length 1 | Ordered list of edit operations to apply.          |

## DisplayConfig

Display-oriented configuration for quiz presentation.

| field                   | type        | required | constraints  | notes                                                                                                                                                                              |
| ----------------------- | ----------- | -------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| archetype_name_template | string      | no       | min length 1 | Optional Mustache template for combining matched main and subtype archetype names. Available placeholders: {{main}}, {{sub}}, {{main_archetype_name}}, and {{sub_archetype_name}}. |
| archetypes              | Archetype[] | no       | default      | Ordered archetype and subtype definitions used for result classification.                                                                                                          |
| completion_markdown     | string      | no       |              | Markdown shown after the quiz is completed.                                                                                                                                        |
| intro_markdown          | string      | no       |              | Markdown shown before the quiz starts.                                                                                                                                             |
| result_scale_max        | number      | no       |              | Optional upper bound for result display scaling.                                                                                                                                   |
| result_scale_min        | number      | no       |              | Optional lower bound for result display scaling.                                                                                                                                   |
| theme_colors            | ThemeColors | no       |              | Optional respondent UI theme color overrides.                                                                                                                                      |
| trait_polarity          | ZodEnum     | no       | default      | Whether traits display as bidirectional scales (centered) or unidirectional (0 to max).                                                                                            |

Notes:
- When a main archetype and subtype both match, archetype_name_template renders the combined result name with Mustache. If omitted, the display falls back to "Main (Subtype)".
- The template is ignored for main-only results, which display the main archetype name.

## ScoringConfig

Scoring-related configuration for the whole quiz definition.

| field              | type                    | required | constraints  | notes                                                                                   |
| ------------------ | ----------------------- | -------- | ------------ | --------------------------------------------------------------------------------------- |
| adaptive_selection | AdaptiveSelectionConfig | no       |              | Adaptive question selection configuration. Required when question_ordering is adaptive. |
| prior_info         | number                  | no       | default, > 0 | Default prior information value used by adaptive scoring.                               |

## AdaptiveSelectionConfig

Configuration for adaptive question selection. All vectors must align with the quiz trait order.

| field                         | type     | required | constraints           | notes                                                                                                               |
| ----------------------------- | -------- | -------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| axis_purity_min               | number   | no       | default, >= 0, <= 1   | Minimum cosine similarity between expected-info and need vectors for a question to be a strong candidate.           |
| batch_diversity_penalty       | number   | no       | default, >= 0         | Greedy batch diversity penalty multiplier for similarity to already-selected candidates.                            |
| candidate_count               | number   | no       | default, integer, > 0 | Candidate batch size returned per selection cycle.                                                                  |
| candidate_pool_size           | number   | no       | default, integer, > 0 | Number of top-scored questions to retain before greedy diversity selection.                                         |
| contradiction_followup_weight | number   | no       | default, >= 0         | Weight applied to contradiction follow-up pressure in the need vector.                                              |
| contradiction_target          | number[] | yes      |                       | Per-trait target contradiction level for follow-up scaling. Length must equal trait count.                          |
| max_questions                 | number   | no       | default, integer, > 0 | Hard upper limit on questions presented.                                                                            |
| min_goodness_to_ask           | number   | no       | default, >= 0, <= 1   | Normalized goodness threshold below which a question is considered a weak candidate. Used in post-minimum stopping. |
| min_questions                 | number   | no       | default, integer, > 0 | Minimum questions answered before early-stop rules apply.                                                           |
| need_power                    | number   | no       | default, > 0          | Exponent applied to deficit ratio when computing the need vector.                                                   |
| off_axis_penalty              | number   | no       | default, >= 0         | Penalty multiplier for questions that over-load already-saturated traits.                                           |
| recent_redundancy_penalty     | number   | no       | default, >= 0         | Penalty multiplier for cosine similarity to recently answered questions.                                            |
| recent_window                 | number   | no       | default, integer, > 0 | Number of most-recently answered questions considered for redundancy penalty.                                       |
| skipped_penalty               | number   | no       | default, >= 0         | Raw score penalty applied to questions previously skipped in this session.                                          |
| target_info                   | number[] | yes      |                       | Per-trait target information level. Length must equal trait count.                                                  |
| trait_priority                | number[] | yes      |                       | Per-trait priority multiplier applied to need. Length must equal trait count.                                       |
| uncertainty_weight            | number   | no       | default, >= 0         | Weight applied to the uncertainty term in the need vector.                                                          |

Notes:
- target_info, trait_priority, and contradiction_target must each have length equal to trait count.
- Adaptive selection chooses questions by computing a need vector and scoring candidates against expected information gain.

## Question

A single v1 quiz question.

| field              | type             | required | constraints  | notes                                                                                                                                  |
| ------------------ | ---------------- | -------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| active             | boolean          | no       | default      | Whether the question is active in the definition.                                                                                      |
| adaptive_eligible  | boolean          | no       | default      | Whether the question may be used by adaptive selection logic.                                                                          |
| display_order      | number           | yes      | integer, > 0 | 1-based display order within the quiz.                                                                                                 |
| help_text          | string           | no       | default      | Optional helper text shown with the question.                                                                                          |
| id                 | string           | yes      | min length 1 | Stable machine-readable question identifier.                                                                                           |
| information_matrix | Matrix           | yes      |              | A flattened numeric matrix used for per-response per-trait weights. Indexing rule: values[response_index * trait_count + trait_index]. |
| kind               | "single_choice"  | yes      |              | Question kind. Only single_choice is accepted in v1.                                                                                   |
| prompt             | string           | yes      | min length 1 | Question prompt shown to the participant.                                                                                              |
| responses          | ResponseOption[] | yes      | min length 2 | Ordered response options for the question.                                                                                             |
| score_matrix       | Matrix           | yes      |              | A flattened numeric matrix used for per-response per-trait weights. Indexing rule: values[response_index * trait_count + trait_index]. |
| tags               | string[]         | no       | default      | Optional freeform tags for filtering or tooling.                                                                                       |

Notes:
- Question responses, score_matrix rows, and information_matrix rows must stay aligned.
- score_matrix and information_matrix both use the Matrix indexing rule.

## QuizEditOperation

Union of all accepted quiz edit operations.

| op                       | schema               | notes                                                                                                                                     |
| ------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| "create_archetype"       | CreateArchetype      |                                                                                                                                           |
| "create_question"        | CreateQuestion       | Add a new question to the definition.                                                                                                     |
| "delete_archetype"       | DeleteArchetype      |                                                                                                                                           |
| "delete_question"        | DeleteQuestion       | Delete an existing question using optimistic concurrency on the old hash.                                                                 |
| "merge_at_path"          | MergeAtPath          |                                                                                                                                           |
| "remove_at_path"         | RemoveAtPath         |                                                                                                                                           |
| "reorder_archetypes"     | ReorderArchetypes    |                                                                                                                                           |
| "reorder_questions"      | ReorderQuestions     | Reorder the existing questions by supplying the full ordered question id set.                                                             |
| "reorder_traits"         | ReorderTraits        | Reorder the existing trait list before any questions exist.                                                                               |
| "replace_archetype"      | ReplaceArchetype     |                                                                                                                                           |
| "replace_at_path"        | ReplaceAtPath        |                                                                                                                                           |
| "replace_display_config" | ReplaceDisplayConfig | Replace the entire display_config object. This operation replaces the whole display_config object.                                        |
| "replace_question"       | ReplaceQuestion      | Replace an existing question using optimistic concurrency on the old hash.                                                                |
| "replace_scoring_config" | ReplaceScoringConfig | Replace the entire scoring_config object. This operation replaces the whole scoring_config object. It does not rewrite question matrices. |
| "set_traits"             | SetTraits            | Replace the full trait list during initial setup.                                                                                         |
| "update_quiz_metadata"   | UpdateQuizMetadata   | Update top-level quiz metadata without changing traits or questions. This operation affects title, description, and question_ordering.    |
| "update_trait_text"      | UpdateTraitText      | Update only trait labels and descriptions without changing trait structure.                                                               |

## ThemeColors

Optional fixed-key theme colors used to style respondent-facing UI.

| field            | type   | required | constraints | notes                                           |
| ---------------- | ------ | -------- | ----------- | ----------------------------------------------- |
| accent           | string | no       |             | Primary accent color for buttons and emphasis.  |
| accent_text      | string | no       |             | Foreground text color shown on accent surfaces. |
| body_text        | string | no       |             | Body text color.                                |
| chart_band       | string | no       |             | Chart spread/band color token.                  |
| chart_grid       | string | no       |             | Chart grid/axis line color token.               |
| chart_negative   | string | no       |             | Negative/result-backward chart color token.     |
| chart_positive   | string | no       |             | Positive/result-forward chart color token.      |
| heading_text     | string | no       |             | Heading text color.                             |
| muted_text       | string | no       |             | Muted/supporting text color.                    |
| page_background  | string | no       |             | Page background color for respondent screens.   |
| panel_background | string | no       |             | Primary panel/surface background color.         |
| panel_border     | string | no       |             | Primary panel border color.                     |

Notes:
- All theme color fields are optional; absent values fall back to the default UI palette.
- Custom themes can be created by setting theme_colors directly via replace_display_config.

## Trait

One measured trait axis in the quiz definition.

| field         | type   | required | constraints  | notes                                            |
| ------------- | ------ | -------- | ------------ | ------------------------------------------------ |
| description   | string | no       | default      | Optional explanatory text for the trait.         |
| display_order | number | yes      | integer, > 0 | 1-based display order for rendering.             |
| high_label    | string | yes      | min length 1 | Label shown for the high end of the trait scale. |
| id            | string | yes      | min length 1 | Stable machine-readable trait identifier.        |
| label         | string | yes      | min length 1 | Human-facing trait label.                        |
| low_label     | string | yes      | min length 1 | Label shown for the low end of the trait scale.  |

Notes:
- Trait order defines the matrix column order for every question.

## Archetype

Main archetype or subtype definition used for result classification.

| field                            | type                      | required | constraints   | notes                                                          |
| -------------------------------- | ------------------------- | -------- | ------------- | -------------------------------------------------------------- |
| compatibility_main_archetype_ids | string[]                  | no       | default       | Main archetype ids used by compatibility_mode for subtypes.    |
| compatibility_mode               | ZodEnum                   | no       |               | Subtype compatibility mode against main archetype ids.         |
| description                      | string                    | yes      | min length 1  | Human-facing archetype description prose.                      |
| display_order                    | number                    | yes      | integer, > 0  | 1-based display and matching order for archetype traversal.    |
| icon                             | string                    | no       | max length 16 | Optional unicode icon string for display.                      |
| id                               | string                    | yes      | min length 1  | Stable machine-readable archetype identifier.                  |
| is_main                          | boolean                   | yes      |               | True for main archetypes, false for subtypes.                  |
| name                             | string                    | yes      | min length 1  | Human-facing archetype name.                                   |
| trait_conditions                 | ArchetypeTraitCondition[] | yes      | min length 1  | All listed conditions must pass for this archetype to match.   |
| variants_by_main_archetype_id    | ZodRecord                 | no       | default       | Optional subtype variant overrides keyed by main archetype id. |

## CreateArchetype

| field               | type               | required | constraints  | notes                                                                |
| ------------------- | ------------------ | -------- | ------------ | -------------------------------------------------------------------- |
| after_archetype_id  | string             | no       | min length 1 |                                                                      |
| archetype           | Archetype          | yes      |              | Main archetype or subtype definition used for result classification. |
| before_archetype_id | string             | no       | min length 1 |                                                                      |
| op                  | "create_archetype" | yes      |              |                                                                      |

## CreateQuestion

Add a new question to the definition.

| field              | type              | required | constraints  | notes                                                                                                                                                                                   |
| ------------------ | ----------------- | -------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| after_question_id  | string            | no       | min length 1 |                                                                                                                                                                                         |
| before_question_id | string            | no       | min length 1 |                                                                                                                                                                                         |
| op                 | "create_question" | yes      |              |                                                                                                                                                                                         |
| question           | Question          | yes      |              | A single v1 quiz question. Question responses, score_matrix rows, and information_matrix rows must stay aligned. score_matrix and information_matrix both use the Matrix indexing rule. |

## DeleteArchetype

| field        | type               | required | constraints  | notes |
| ------------ | ------------------ | -------- | ------------ | ----- |
| archetype_id | string             | yes      | min length 1 |       |
| op           | "delete_archetype" | yes      |              |       |

## DeleteQuestion

Delete an existing question using optimistic concurrency on the old hash.

| field             | type              | required | constraints  | notes |
| ----------------- | ----------------- | -------- | ------------ | ----- |
| old_question_hash | string            | yes      |              |       |
| op                | "delete_question" | yes      |              |       |
| question_id       | string            | yes      | min length 1 |       |

## Matrix

A flattened numeric matrix used for per-response per-trait weights.

| field  | type        | required | constraints  | notes                                                    |
| ------ | ----------- | -------- | ------------ | -------------------------------------------------------- |
| cols   | number      | yes      | integer, > 0 | Number of matrix columns.                                |
| layout | "row_major" | yes      |              | Matrix storage layout. Only row_major is accepted in v1. |
| rows   | number      | yes      | integer, > 0 | Number of matrix rows.                                   |
| values | number[]    | yes      |              | Flattened matrix values in row-major order.              |

Notes:
- Indexing rule: values[response_index * trait_count + trait_index].

## MergeAtPath

| field | type            | required | constraints  | notes |
| ----- | --------------- | -------- | ------------ | ----- |
| op    | "merge_at_path" | yes      |              |       |
| path  | PathEditPath    | yes      | min length 1 |       |
| value | ZodRecord       | yes      |              |       |

## RemoveAtPath

| field | type             | required | constraints  | notes |
| ----- | ---------------- | -------- | ------------ | ----- |
| op    | "remove_at_path" | yes      |              |       |
| path  | PathEditPath     | yes      | min length 1 |       |

## ReorderArchetypes

| field         | type                 | required | constraints  | notes |
| ------------- | -------------------- | -------- | ------------ | ----- |
| archetype_ids | string[]             | yes      | min length 1 |       |
| op            | "reorder_archetypes" | yes      |              |       |

## ReorderQuestions

Reorder the existing questions by supplying the full ordered question id set.

| field        | type                | required | constraints  | notes |
| ------------ | ------------------- | -------- | ------------ | ----- |
| op           | "reorder_questions" | yes      |              |       |
| question_ids | string[]            | yes      | min length 1 |       |

## ReorderTraits

Reorder the existing trait list before any questions exist.

| field     | type             | required | constraints | notes                       |
| --------- | ---------------- | -------- | ----------- | --------------------------- |
| op        | "reorder_traits" | yes      |             |                             |
| trait_ids | string[]         | yes      |             | Full ordered trait id list. |

## ReplaceArchetype

| field        | type                | required | constraints  | notes                                                                |
| ------------ | ------------------- | -------- | ------------ | -------------------------------------------------------------------- |
| archetype    | Archetype           | yes      |              | Main archetype or subtype definition used for result classification. |
| archetype_id | string              | yes      | min length 1 |                                                                      |
| op           | "replace_archetype" | yes      |              |                                                                      |

## ReplaceAtPath

| field | type              | required | constraints  | notes |
| ----- | ----------------- | -------- | ------------ | ----- |
| op    | "replace_at_path" | yes      |              |       |
| path  | PathEditPath      | yes      | min length 1 |       |
| value | ZodUnknown        | yes      |              |       |

## ReplaceDisplayConfig

Replace the entire display_config object.

| field          | type                     | required | constraints | notes                                                                                                                                                                                                                                                                                                                     |
| -------------- | ------------------------ | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| display_config | DisplayConfig            | yes      |             | Display-oriented configuration for quiz presentation. When a main archetype and subtype both match, archetype_name_template renders the combined result name with Mustache. If omitted, the display falls back to "Main (Subtype)". The template is ignored for main-only results, which display the main archetype name. |
| op             | "replace_display_config" | yes      |             |                                                                                                                                                                                                                                                                                                                           |

Notes:
- This operation replaces the whole display_config object.

## ReplaceQuestion

Replace an existing question using optimistic concurrency on the old hash.

| field             | type               | required | constraints  | notes                                                                                                                                                                                   |
| ----------------- | ------------------ | -------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| old_question_hash | string             | yes      |              |                                                                                                                                                                                         |
| op                | "replace_question" | yes      |              |                                                                                                                                                                                         |
| question          | Question           | yes      |              | A single v1 quiz question. Question responses, score_matrix rows, and information_matrix rows must stay aligned. score_matrix and information_matrix both use the Matrix indexing rule. |
| question_id       | string             | yes      | min length 1 |                                                                                                                                                                                         |

## ReplaceScoringConfig

Replace the entire scoring_config object.

| field          | type                     | required | constraints | notes                                                        |
| -------------- | ------------------------ | -------- | ----------- | ------------------------------------------------------------ |
| op             | "replace_scoring_config" | yes      |             |                                                              |
| scoring_config | ScoringConfig            | yes      |             | Scoring-related configuration for the whole quiz definition. |

Notes:
- This operation replaces the whole scoring_config object.
- It does not rewrite question matrices.

## SetTraits

Replace the full trait list during initial setup.

| field  | type         | required | constraints | notes                                          |
| ------ | ------------ | -------- | ----------- | ---------------------------------------------- |
| op     | "set_traits" | yes      |             |                                                |
| traits | Trait[]      | yes      |             | Full replacement trait list for initial setup. |

## UpdateQuizMetadata

Update top-level quiz metadata without changing traits or questions.

| field             | type                   | required | constraints  | notes |
| ----------------- | ---------------------- | -------- | ------------ | ----- |
| description       | string                 | no       |              |       |
| op                | "update_quiz_metadata" | yes      |              |       |
| question_ordering | QuestionOrdering       | no       |              |       |
| title             | string                 | no       | min length 1 |       |

Notes:
- This operation affects title, description, and question_ordering.

## UpdateTraitText

Update only trait labels and descriptions without changing trait structure.

| field       | type                | required | constraints  | notes                        |
| ----------- | ------------------- | -------- | ------------ | ---------------------------- |
| description | string              | no       |              |                              |
| high_label  | string              | no       | min length 1 |                              |
| label       | string              | no       | min length 1 |                              |
| low_label   | string              | no       | min length 1 |                              |
| op          | "update_trait_text" | yes      |              |                              |
| trait_id    | string              | yes      | min length 1 | Trait id to update in place. |

## ResponseOption

A single answer choice for a single-choice question.

| field         | type   | required | constraints  | notes                                               |
| ------------- | ------ | -------- | ------------ | --------------------------------------------------- |
| display_order | number | yes      | integer, > 0 | 1-based display order within the question.          |
| help_text     | string | no       | default      | Optional helper text shown with the response.       |
| id            | string | yes      | min length 1 | Stable machine-readable response identifier.        |
| label         | string | yes      | min length 1 | Human-facing answer label.                          |
| value         | number | yes      |              | Response value preserved in the definition payload. |

Notes:
- Response order defines the row order used by the question matrices.

## ArchetypeTraitCondition

One trait-level matching rule for an archetype.

| field             | type   | required | constraints  | notes                                                   |
| ----------------- | ------ | -------- | ------------ | ------------------------------------------------------- |
| contradiction_max | number | no       |              | Optional inclusive upper bound for trait contradiction. |
| contradiction_min | number | no       |              | Optional inclusive lower bound for trait contradiction. |
| score_max         | number | no       |              | Optional inclusive upper bound for trait estimate.      |
| score_min         | number | no       |              | Optional inclusive lower bound for trait estimate.      |
| trait_id          | string | yes      | min length 1 | Trait id this condition applies to.                     |

## ArchetypeVariant

Subtype display variant keyed by main archetype id.

| field       | type   | required | constraints  | notes                                                                                |
| ----------- | ------ | -------- | ------------ | ------------------------------------------------------------------------------------ |
| description | string | yes      | min length 1 | Variant description shown when this subtype is paired with the keyed main archetype. |
| name        | string | yes      | min length 1 | Variant name shown when this subtype is paired with the keyed main archetype.        |

## CrossFieldValidationRules

- CreateQuestion: Cannot specify both before_question_id and after_question_id in the same operation.
- QuizDefinition: Each question matrix shape must match responses x traits.
- QuizDefinition: Each question matrix values length must equal rows * cols.
- QuizDefinition: Empty quizzes are valid initial definitions.
- QuizDefinition: Question IDs must be unique.
- QuizDefinition: Questions cannot be defined until at least one trait exists.
- QuizDefinition: Response IDs must be unique within each question.
- QuizDefinition: Trait IDs must be unique.
- QuizEditPatch: base_definition_version must match the current stored definition version before the patch is applied.
- ReorderQuestions: question_ids must contain exactly the current set of question IDs with no duplicates.
- ReorderTraits: Allowed only when questions.length === 0.
- ReorderTraits: Changes future matrix column order.
- ReorderTraits: trait_ids must contain exactly the current trait IDs.
- ReplaceQuestion: question.id must match question_id when applying the replacement.
- SetTraits: Allowed only when questions.length === 0.
- SetTraits: Trait order defines future matrix column order.
- UpdateTraitText: Allowed before or after questions exist.
- UpdateTraitText: Does not require matrix migration.
- UpdateTraitText: Must not change trait id or trait order.
