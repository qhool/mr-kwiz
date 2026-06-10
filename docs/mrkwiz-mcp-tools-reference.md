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
