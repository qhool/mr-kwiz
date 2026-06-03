import { describe, expect, it } from 'vitest';

import { buildAdminQuestionEditPrompt } from '../admin-question-edit-prompt';
import { renderAdminSkillPrompt } from '../admin-skill-prompt';
import { buildRespondentResultsPrompt } from '../respondent-results-prompt';
import { makeAnswers, testDefinition } from './fixtures';

describe('buildRespondentResultsPrompt', () => {
    it('renders a stable prompt with trait scores and answered question details', () => {
        const prompt = buildRespondentResultsPrompt(testDefinition, makeAnswers(['q01', 'q04', 'q08'], 1));

        expect(prompt).toContain('# Mr. Kwiz Results Analysis Request');
        expect(prompt).toContain('Quiz title: Adaptive Selection Test Quiz');
        expect(prompt).toContain('### q01');
        expect(prompt).toContain('| Trait A |');
        expect(prompt).toMatchSnapshot();
    });
});

describe('buildAdminQuestionEditPrompt', () => {
    it('renders a stable replace-question scaffold with hash and baseline metadata', async () => {
        const prompt = await buildAdminQuestionEditPrompt(testDefinition.questions[0]!, 17);

        expect(prompt).toContain(`Question ID: ${testDefinition.questions[0]!.id}`);
        expect(prompt).toContain('"base_definition_version": 17');
        expect(prompt).toContain('"op": "replace_question"');
        expect(prompt).toMatchSnapshot();
    });
});

describe('renderAdminSkillPrompt', () => {
    it('renders a stable skill prompt with trait, question, and adaptive configuration context', async () => {
        const prompt = await renderAdminSkillPrompt(testDefinition, {
            current_definition_version: 12,
            description: testDefinition.description,
            id: 'quiz-123',
            title: testDefinition.title,
        });

        expect(prompt).toContain('## Trait Order and Polarity');
        expect(prompt).toContain('## Question Index');
        expect(prompt).toContain('## Adaptive Selection Configuration');
        expect(prompt).toContain('Current definition version: 12');
        expect(prompt).toContain('Question ordering: adaptive');
        expect(prompt).toMatchSnapshot();
    });
});