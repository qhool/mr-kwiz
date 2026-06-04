import { describe, expect, it } from 'vitest';

import { buildAdminQuestionEditPrompt } from '../admin-question-edit-prompt';
import { renderAdminSkillPrompt } from '../admin-skill-prompt';
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