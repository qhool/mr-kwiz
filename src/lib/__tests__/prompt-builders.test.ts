import { describe, expect, it } from 'vitest';

import { buildAdminQuestionEditPrompt } from '../admin-question-edit-prompt';
import { renderAdminSkillPrompt } from '../admin-skill-prompt';
import { MRKWIZ_MCP_TOOLS } from '../mrkwiz-mcp-tools';
import { MRKWIZ_SKILL_NAMES, renderMrKwizSkill } from '../mrkwiz-skills';
import { buildRespondentResultsPrompt } from '../respondent-results-prompt';
import { makeAnswers, testDefinition } from './fixtures';

describe('buildRespondentResultsPrompt', () => {
    it('renders a formatted prompt with trait scores and answered question details', () => {
        const prompt = buildRespondentResultsPrompt(testDefinition, makeAnswers(['q01', 'q04', 'q08'], 1));

        expect(prompt).toContain('# Mr. Kwiz Results Analysis Request');
        expect(prompt).toContain('Quiz title: Adaptive Selection Test Quiz');
        
        // Formats score table correctly
        expect(prompt).toContain('| Trait | Estimate | Low Label | High Label | Polarity |');
        expect(prompt).toContain('| Trait A | -0.48 | Low A | High A | bidirectional |');

        // Formats detailed trait list correctly with proper signals
        expect(prompt).toContain('- Trait A (trait-a)');
        expect(prompt).toContain('Estimate: -0.48');
        expect(prompt).toContain('Strong-signal question ids: q01, q08');
        
        // Includes question details
        expect(prompt).toContain('### q01');
    });
});

describe('buildAdminQuestionEditPrompt', () => {
    it('renders a replace-question scaffold with hash and baseline metadata embedded in JSON', async () => {
        const prompt = await buildAdminQuestionEditPrompt(testDefinition.questions[0]!, 17);

        expect(prompt).toContain(`Question ID: ${testDefinition.questions[0]!.id}`);
        expect(prompt).toContain('"base_definition_version": 17');
        expect(prompt).toContain('"op": "replace_question"');
        
        // Injects correct hashed checksum of the original question and ID
        expect(prompt).toContain('"old_question_hash": "c41b8e39223f2c574f376044537e7d351ce8ebd9c649beb58388e805a1fab580"');
        expect(prompt).toContain('"id": "q01"');
        expect(prompt).toContain('"kind": "single_choice"');
    });
});

describe('renderAdminSkillPrompt', () => {
    it('renders a compiled skill prompt properly injecting tables for traits, questions, and adaptive config', async () => {
        const prompt = await renderAdminSkillPrompt(testDefinition, {
            current_definition_version: 12,
            description: testDefinition.description,
            id: 'quiz-123',
            title: testDefinition.title,
        });

        expect(prompt).toContain('Current definition version: 12');
        expect(prompt).toContain('Question ordering: adaptive');

        // Check if trait order table is formatted properly
        expect(prompt).toContain('## Trait Order and Polarity');
        expect(prompt).toContain('| position | trait_id | label   | low_label | high_label |');
        expect(prompt).toContain('| 1        | trait-a  | Trait A | Low A     | High A     |');

        // Includes theme color section for custom style editing
        expect(prompt).toContain('## Theme Colors');

        // Check if adaptive selection configuration table is formatted properly
        expect(prompt).toContain('## Adaptive Selection Configuration');
        expect(prompt).toContain('| position | target_info | trait_priority | contradiction_target |');
        expect(prompt).toContain('| 1        | 2           | 1              | 0.25                 |');

        // Check if question index table is formatted properly
        expect(prompt).toContain('## Question Index');
        expect(prompt).toContain('| position | question_id | prompt_summary | responses |');
        expect(prompt).toContain('| 1        | q01         | Prompt q01     | 3         |');
    });
});

describe('renderMrKwizSkill', () => {
    it('renders each hosted skill', async () => {
        for (const skillName of MRKWIZ_SKILL_NAMES) {
            await expect(renderMrKwizSkill(skillName)).resolves.toContain(`#`);
        }
    });

    it('renders setup guidance with troubleshooting and plugin tools', async () => {
        const skill = await renderMrKwizSkill('mrkwiz-opencode-setup');

        expect(skill).toContain('Fresh Bootstrap Flow');
        expect(skill).toContain('Plugin Installed But Tools Missing');
        expect(skill).toContain('Testing Checklist');
        expect(skill).toContain('mrkwiz_bridge_status');
        expect(skill).toContain('mrkwiz_reset_callback_urls');
        expect(skill).toContain('mrkwiz_do_pending_request');
        expect(skill).toContain('mrkwiz_refresh_quiz_workspace_config');
        expect(skill).toContain('mrkwiz_get_system_prompt');
        expect(skill).toContain('mrkwiz_get_tool_snapshot');
        expect(skill).toContain('mrkwiz_configure_mcp');
        expect(skill).toContain('static token-specific MCP servers');
        expect(skill).toContain('## functions.mrkwiz_get_quiz_context');
    });

    it('renders design guidance without edit/apply tool instructions', async () => {
        const skill = await renderMrKwizSkill('mrkwiz-quiz-design');

        expect(skill).toContain('Trait Design');
        expect(skill).toContain('Question Design');
        expect(skill).toContain('First Steps');
        expect(skill).toContain('Read any pending user request');
        expect(skill).toContain('Handoff To Editing');
        expect(skill).toContain('load `mrkwiz-quiz-edit`');
        expect(skill).not.toContain('_apply_edit');
        expect(skill).not.toContain('## QuizEditPatch');
    });

    it('renders edit guidance with generated schema docs and every MCP tool', async () => {
        const skill = await renderMrKwizSkill('mrkwiz-quiz-edit');

        expect(skill).toContain('## QuizEditPatch');
        expect(skill).toContain('## QuizEditOperation');
        expect(skill).toContain('functions.<mcp_name>_get_quiz_context');
        expect(skill).toContain('functions.<mcp_name>_validate_edit');
        expect(skill).toContain('functions.<mcp_name>_apply_edit');
        expect(skill).toContain('Do not use bridge setup helpers');

        for (const tool of MRKWIZ_MCP_TOOLS) {
            expect(skill).toContain(`functions.mrkwiz_${tool.name}`);
            expect(skill).toContain(tool.description);
        }
    });

    it('does not render unknown skill names', async () => {
        await expect(renderMrKwizSkill('not-a-real-skill')).resolves.toBeNull();
    });
});
