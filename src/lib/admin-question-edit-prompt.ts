import { hashQuestion, type Question } from './quiz-definition';

export const buildAdminQuestionEditPrompt = async (
    question: Question,
    baseDefinitionVersion: number
): Promise<string> => {
    const oldQuestionHash = await hashQuestion(question);
    const serializedPatch = JSON.stringify(
        {
            base_definition_version: baseDefinitionVersion,
            operations: [
                {
                    op: 'replace_question',
                    question_id: question.id,
                    old_question_hash: oldQuestionHash,
                    question,
                },
            ],
        },
        null,
        2
    );

    return [
        'The user would like to edit the following quiz question.',
        'Ask the user what they would like to change about it.',
        'When you produce the final answer, return exactly one complete and valid replace-question patch JSON object using the scaffold below.',
        'Keep base_definition_version, question_id, and old_question_hash exactly as provided unless the application gives you a newer baseline.',
        'Update only operations[0].question to reflect the requested edits.',
        '',
        `Question ID: ${question.id}`,
        '',
        'Replace-question patch scaffold:',
        '```json',
        serializedPatch,
        '```',
    ].join('\n');
};