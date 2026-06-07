const skillMarkdown = `---
name: mrkwiz-quiz-author
description: Use when authoring or editing MrKwiz quizzes, quiz questions, traits, scoring matrices, archetypes, display settings, themes, OpenCode bootstrap, or MrKwiz MCP setup.
---

# MrKwiz Quiz Author

Use this skill whenever the user is authoring or editing a MrKwiz quiz, setting up MrKwiz MCP, connecting OpenCode to MrKwiz, or recovering from a token/setup issue.

## User Guidance

Assume the user may not be technical. Use short steps, plain language, and explicit confirmation points. Do not assume they know where config files live, what MCP means, or when OpenCode must restart.

If setup is incomplete:

- explain what is missing
- give one next step at a time
- prefer copyable snippets
- tell the user when to restart OpenCode
- preserve paste-back as a fallback

## MrKwiz Model

MrKwiz quizzes are editable JSON definitions with:

- traits: latent dimensions measured by questions
- questions: single-choice prompts with response options
- score_matrix: response x trait signed movements
- information_matrix: response x trait evidence weights
- scoring_config: global scoring and adaptive selection settings
- display_config: intro/completion text, archetypes, theme colors, and result display options
- archetypes: result classifications based on trait conditions

Trait order defines matrix column order. Response order defines matrix row order. For matrix values use row-major indexing: values[response_index * trait_count + trait_index].

Once questions exist, do not add, remove, rename, or reorder traits. Use update_trait_text for wording-only trait edits.

## MCP Workflow

Use the MrKwiz MCP tools when available.

For every editing task:

1. Call get_quiz_context first.
2. For question replacement or deletion, call get_question_context for the target question and preserve old_question_hash.
3. Draft the smallest correct edit.
4. Call validate_edit before saving.
5. Apply only after user confirmation unless the user clearly requested direct application.

If a token-expired error appears, tell the user their MrKwiz OpenCode token expired and guide them to create a replacement token from the MrKwiz admin AI page. Ask them to paste the new bootstrap prompt into OpenCode.

## OpenCode Plugin Workflow

If @mrkwiz/opencode-plugin is installed, prefer plugin tools during bootstrap.

First call mrkwiz_configure_default_model with the exact provider/model identifier currently running the bootstrap conversation, using the model ID from your system context. Example: mrkwiz_configure_default_model({ "model": "provider/model-id" }). This stores the default model in local .opencode/mrkwiz.json so MrKwiz-created sessions do not accidentally select an unavailable model.

Then call mrkwiz_configure_mcp. It saves the raw MCP token in the local .opencode/mrkwiz.json plugin config, keyed by the token's SHA-256 hash, and registers a token-hash callback URL with MrKwiz. Do not expose the raw token except as bearer auth.

The plugin does not activate the MrKwiz MCP server at startup. When the MrKwiz admin UI calls a token-hash callback action, the plugin looks up the raw token locally, configures or reconfigures the mrkwiz MCP server with Authorization: Bearer <raw token>, then prompts the agent to load this skill and begin work.

Use mrkwiz_bridge_status to inspect connected token hashes, callback URLs, configured default model, and the current active MCP token hash. A token can be valid in MrKwiz, connected to a callback, or active as the current OpenCode MCP token.

If the plugin is not available, explain how to install it and tell the user OpenCode may need to restart.

## Editing Rules

- Prefer surgical edits over full-object replacement.
- Use merge_at_path, replace_at_path, or remove_at_path for display_config and scoring_config when appropriate.
- Use explicit question operations for questions.
- Use explicit archetype operations for archetypes.
- Do not expose large JSON patches unless needed.
- Keep IDs stable unless the user asks to change them.
- Keep question responses plausible, nonjudgmental, and concrete.
- Avoid medical, legal, diagnostic, moralizing, or protected-class judgments unless the user has explicitly provided a safe framing.

## Fallback

If MCP is unavailable, use paste-back mode. Produce exactly one valid QuizEditPatch JSON object and tell the user to paste it into the MrKwiz patch box.
`;

const skillCatalog = () => ({
    skills: [
        {
            name: 'mrkwiz-quiz-author',
            files: ['SKILL.md'],
        },
    ],
});

export const handleSkillsGet = async (request: Request, path = ''): Promise<Response> => {
    const normalizedPath = path.replace(/^\/+|\/+$/g, '');

    if (!normalizedPath || normalizedPath === 'index.json') {
        return new Response(JSON.stringify(skillCatalog()), {
            headers: { 'content-type': 'application/json; charset=utf-8' },
        });
    }

    if (normalizedPath === 'mrkwiz-quiz-author/SKILL.md') {
        return new Response(skillMarkdown, {
            headers: { 'content-type': 'text/markdown; charset=utf-8' },
        });
    }

    return new Response('Skill not found.', { status: 404 });
};
