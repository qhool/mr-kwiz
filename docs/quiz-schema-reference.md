# Auto-Generated Quiz Schema Reference

Generated from the application Zod schemas and inline schema metadata.

## QuizDefinition

The full current quiz definition stored and edited by the admin flow.

| field              | type          | required | constraints  | notes                                                        |
| ------------------ | ------------- | -------- | ------------ | ------------------------------------------------------------ |
| definition_version | number        | yes      | integer, > 0 | Monotonic version for the current definition snapshot.       |
| description        | string        | no       | default      | Optional quiz description.                                   |
| display_config     | DisplayConfig | yes      |              | Display-oriented configuration for quiz presentation.        |
| questions          | Question[]    | yes      | min length 1 | Ordered question definitions in the quiz.                    |
| schema_version     | number        | yes      | integer, > 0 | Quiz definition schema version.                              |
| scoring_config     | ScoringConfig | yes      |              | Scoring-related configuration for the whole quiz definition. |
| title              | string        | yes      | min length 1 | Human-facing quiz title.                                     |
| traits             | Trait[]       | yes      | min length 1 | Ordered trait definitions used by all questions.             |

## QuizEditPatch

Patch envelope accepted by the admin edit API.

| field                   | type                | required | constraints  | notes                                              |
| ----------------------- | ------------------- | -------- | ------------ | -------------------------------------------------- |
| base_definition_version | number              | yes      | integer, > 0 | Definition version the patch was authored against. |
| operations              | QuizEditOperation[] | yes      | min length 1 | Ordered list of edit operations to apply.          |

## DisplayConfig

Display-oriented configuration for quiz presentation.

| field               | type   | required | constraints | notes                                            |
| ------------------- | ------ | -------- | ----------- | ------------------------------------------------ |
| completion_markdown | string | no       |             | Markdown shown after the quiz is completed.      |
| intro_markdown      | string | no       |             | Markdown shown before the quiz starts.           |
| result_scale_max    | number | no       |             | Optional upper bound for result display scaling. |
| result_scale_min    | number | no       |             | Optional lower bound for result display scaling. |

## ScoringConfig

Scoring-related configuration for the whole quiz definition.

| field      | type   | required | constraints  | notes                                                     |
| ---------- | ------ | -------- | ------------ | --------------------------------------------------------- |
| prior_info | number | no       | default, > 0 | Default prior information value used by adaptive scoring. |

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

| op                     | schema             | notes                                                                                                                                    |
| ---------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| "create_question"      | CreateQuestion     | Add a new question to the definition.                                                                                                    |
| "delete_question"      | DeleteQuestion     | Delete an existing question using optimistic concurrency on the old hash.                                                                |
| "reorder_questions"    | ReorderQuestions   | Reorder the existing questions by supplying the full ordered question id set.                                                            |
| "replace_question"     | ReplaceQuestion    | Replace an existing question using optimistic concurrency on the old hash.                                                               |
| "update_quiz_metadata" | UpdateQuizMetadata | Update top-level quiz metadata without changing traits or questions. This operation only affects title, description, and display_config. |

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

## CreateQuestion

Add a new question to the definition.

| field              | type              | required | constraints  | notes                                                                                                                                                                                   |
| ------------------ | ----------------- | -------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| after_question_id  | string            | no       | min length 1 |                                                                                                                                                                                         |
| before_question_id | string            | no       | min length 1 |                                                                                                                                                                                         |
| op                 | "create_question" | yes      |              |                                                                                                                                                                                         |
| question           | Question          | yes      |              | A single v1 quiz question. Question responses, score_matrix rows, and information_matrix rows must stay aligned. score_matrix and information_matrix both use the Matrix indexing rule. |

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

## ReorderQuestions

Reorder the existing questions by supplying the full ordered question id set.

| field        | type                | required | constraints  | notes |
| ------------ | ------------------- | -------- | ------------ | ----- |
| op           | "reorder_questions" | yes      |              |       |
| question_ids | string[]            | yes      | min length 1 |       |

## ReplaceQuestion

Replace an existing question using optimistic concurrency on the old hash.

| field             | type               | required | constraints  | notes                                                                                                                                                                                   |
| ----------------- | ------------------ | -------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| old_question_hash | string             | yes      |              |                                                                                                                                                                                         |
| op                | "replace_question" | yes      |              |                                                                                                                                                                                         |
| question          | Question           | yes      |              | A single v1 quiz question. Question responses, score_matrix rows, and information_matrix rows must stay aligned. score_matrix and information_matrix both use the Matrix indexing rule. |
| question_id       | string             | yes      | min length 1 |                                                                                                                                                                                         |

## UpdateQuizMetadata

Update top-level quiz metadata without changing traits or questions.

| field          | type                   | required | constraints  | notes |
| -------------- | ---------------------- | -------- | ------------ | ----- |
| description    | string                 | no       |              |       |
| display_config | DisplayConfig          | no       |              |       |
| op             | "update_quiz_metadata" | yes      |              |       |
| title          | string                 | no       | min length 1 |       |

Notes:
- This operation only affects title, description, and display_config.

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

## CrossFieldValidationRules

- CreateQuestion: Cannot specify both before_question_id and after_question_id in the same operation.
- QuizDefinition: Each question matrix shape must match responses x traits.
- QuizDefinition: Each question matrix values length must equal rows * cols.
- QuizDefinition: Question IDs must be unique.
- QuizDefinition: Response IDs must be unique within each question.
- QuizDefinition: Trait IDs must be unique.
- QuizEditPatch: base_definition_version must match the current stored definition version before the patch is applied.
- ReorderQuestions: question_ids must contain exactly the current set of question IDs with no duplicates.
- ReplaceQuestion: question.id must match question_id when applying the replacement.
