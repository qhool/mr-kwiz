# Auto-Generated MrKwiz MCP Tools Reference

Generated from the hosted MrKwiz MCP tool definitions used by the server.

OpenCode exposes these dynamic MCP tools under the `mrkwiz` namespace. Use names such as `mrkwiz.get_quiz_context`, `mrkwiz.validate_edit`, and `mrkwiz.apply_edit`.

These tools may not appear in OpenCode static helper/tool lists because they are discovered from the active MCP server at runtime.

## mrkwiz.get_quiz_context

Get the current MrKwiz quiz context and editing reminders.

Input schema:

```json
{
  "type": "object",
  "properties": {}
}
```

## mrkwiz.get_question_context

Get a full question, trait order, and old_question_hash for safe editing.

Input schema:

```json
{
  "type": "object",
  "properties": {
    "question_id": {
      "type": "string"
    }
  },
  "required": [
    "question_id"
  ]
}
```

## mrkwiz.search_questions

Search questions by keywords, tags, trait metric ranges, activity flags, and selectable return fields.

Input schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "keywords": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "keyword_mode": {
      "type": "string",
      "enum": [
        "all",
        "any"
      ]
    },
    "keyword_fields": {
      "type": "array",
      "default": [
        "prompt",
        "help_text",
        "tags"
      ],
      "description": "Fields searched by keywords. Defaults to prompt, help_text, and tags; include responses explicitly to search response labels.",
      "items": {
        "type": "string",
        "enum": [
          "prompt",
          "help_text",
          "responses",
          "response_help_text",
          "tags"
        ]
      }
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "tag_mode": {
      "type": "string",
      "enum": [
        "all",
        "any"
      ]
    },
    "active": {
      "type": "boolean"
    },
    "adaptive_eligible": {
      "type": "boolean"
    },
    "trait_filters": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "trait_id": {
            "type": "string"
          },
          "signal_min": {
            "type": "number"
          },
          "signal_max": {
            "type": "number"
          },
          "abs_signal_min": {
            "type": "number"
          },
          "abs_signal_max": {
            "type": "number"
          },
          "positive_signal_min": {
            "type": "number"
          },
          "positive_signal_max": {
            "type": "number"
          },
          "negative_signal_min": {
            "type": "number"
          },
          "negative_signal_max": {
            "type": "number"
          },
          "expected_information_min": {
            "type": "number"
          },
          "expected_information_max": {
            "type": "number"
          },
          "uncertainty_resolution_min": {
            "type": "number"
          },
          "uncertainty_resolution_max": {
            "type": "number"
          },
          "coverage_min": {
            "type": "number"
          },
          "coverage_max": {
            "type": "number"
          }
        },
        "required": [
          "trait_id"
        ]
      }
    },
    "trait_filter_mode": {
      "type": "string",
      "enum": [
        "all",
        "any"
      ]
    },
    "include_fields": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "id",
          "display_order",
          "prompt",
          "help_text",
          "responses",
          "tags",
          "active",
          "adaptive_eligible",
          "trait_metrics",
          "old_question_hash"
        ]
      }
    },
    "include_summary_vectors": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "max_abs_signal",
          "max_positive_signal",
          "max_negative_signal",
          "max_expected_information",
          "max_uncertainty_resolution",
          "coverage_count"
        ]
      }
    },
    "offset": {
      "type": "number",
      "minimum": 0
    },
    "limit": {
      "type": "number",
      "minimum": 1,
      "maximum": 100
    }
  }
}
```

## mrkwiz.get_edit_capabilities

List supported edit operations for the current quiz state.

Input schema:

```json
{
  "type": "object",
  "properties": {}
}
```

## mrkwiz.validate_edit

Validate a QuizEditPatch without saving it.

Input schema:

```json
{
  "type": "object",
  "properties": {
    "patch": {
      "type": "object"
    }
  },
  "required": [
    "patch"
  ]
}
```

## mrkwiz.apply_edit

Apply a validated QuizEditPatch to the quiz.

Input schema:

```json
{
  "type": "object",
  "properties": {
    "patch": {
      "type": "object"
    }
  },
  "required": [
    "patch"
  ]
}
```

## mrkwiz.set_callback_url

Register the local OpenCode bridge callback URL for this token.

Input schema:

```json
{
  "type": "object",
  "properties": {
    "callback_url": {
      "type": "string"
    },
    "callback_origin": {
      "type": "string"
    }
  },
  "required": [
    "callback_url"
  ]
}
```

## mrkwiz.clear_callback_url

Clear the registered local OpenCode bridge callback URL.

Input schema:

```json
{
  "type": "object",
  "properties": {}
}
```
