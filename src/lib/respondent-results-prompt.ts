import type { QuizDefinition } from './quiz-definition';
import {
    computeRespondentScores,
    getStrongSignalQuestionIdsByTrait,
    type AnsweredQuestion,
} from './respondent-quiz';

const escapeMarkdownCell = (value: string) => value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export const buildRespondentResultsPrompt = (
    definition: QuizDefinition,
    answers: AnsweredQuestion[]
): string => {
    const scoreSummary = computeRespondentScores(definition, answers);
    const selectedArchetype = scoreSummary.selectedArchetype;
    const strongSignalQuestions = getStrongSignalQuestionIdsByTrait(definition, answers);
    const orderedTraits = definition.traits
        .slice()
        .sort((left, right) => left.display_order - right.display_order);
    const answeredQuestionLines = scoreSummary.answeredQuestions.map(({ answerId, question }) => {
        const selectedResponse = question.responses.find((response) => response.id === answerId);

        return [
            `### ${question.id}`,
            '',
            `Prompt: ${question.prompt}`,
            `Selected response: ${selectedResponse?.label ?? answerId}`,
            '',
            'Score matrix:',
            '```json',
            JSON.stringify(question.score_matrix, null, 2),
            '```',
        ].join('\n');
    });

    const traitLines = orderedTraits.map((trait) => {
        const stat = scoreSummary.traitStats[trait.id];
        const strongIds = strongSignalQuestions[trait.id] ?? [];
        const polarity = definition.display_config.trait_polarity ?? 'bidirectional';

        return [
            `- ${trait.label} (${trait.id})`,
            `  Description: ${trait.description || 'No description provided.'}`,
            `  Scale labels: low="${trait.low_label}", high="${trait.high_label}"`,
            `  Polarity: ${polarity}`,
            `  Estimate: ${stat?.estimate.toFixed(2) ?? '0.00'}`,
            `  Spread (uncertainty): ${stat?.spread.toFixed(2) ?? '0.00'}`,
            `  Strong-signal question ids: ${strongIds.length > 0 ? strongIds.join(', ') : 'None'}`,
        ].join('\n');
    });

    const scoreTable = [
        '| Trait | Estimate | Low Label | High Label | Polarity |',
        '| --- | ---: | --- | --- | --- |',
        ...orderedTraits.map(
            (trait) =>
                `| ${escapeMarkdownCell(trait.label)} | ${(scoreSummary.traitStats[trait.id]?.estimate ?? 0).toFixed(2)} | ${escapeMarkdownCell(trait.low_label)} | ${escapeMarkdownCell(trait.high_label)} | ${definition.display_config.trait_polarity ?? 'bidirectional'} |`
        ),
    ].join('\n');

    const selectedArchetypeBlock = selectedArchetype
        ? [
              '## Selected Archetype',
              '',
              `Main archetype: ${selectedArchetype.main.name}`,
              `Main description: ${selectedArchetype.main.description}`,
              ...(selectedArchetype.subtype
                  ? [
                        `Subtype: ${selectedArchetype.subtype.name}`,
                        `Subtype description: ${selectedArchetype.subtype.description}`,
                    ]
                  : []),
              '',
          ].join('\n')
        : '';

    return [
        '# Mr. Kwiz Results Analysis Request',
        '',
        'You are helping a participant understand the output of Mr. Kwiz, an adaptive multidimensional personality quiz. This particular run advanced through questions in display order rather than adaptive selection, but the quiz itself is still the same multidimensional personality-style system.',
        '',
        'Refer to the product as "Mr. Kwiz". Use simple, non-technical language. Start with a moderately detailed prose summary of the results in about three paragraphs, then invite follow-up questions from the user.',
        '',
        'Good follow-up options to suggest include:',
        '- Tell me why it said I am <trait>',
        '- Give me the big-words version',
        '',
        `Quiz title: ${definition.title}`,
        `Quiz description: ${definition.description || 'No description provided.'}`,
        `Results interpretation: The results show estimated trait values based on weighted observations from responses. Spread values indicate uncertainty or variance in the estimate.`,
        '',
        selectedArchetypeBlock,
        '## Trait Scores',
        '',
        scoreTable,
        '',
        '## Traits',
        '',
        ...traitLines,
        '',
        '## Answered Questions Only',
        '',
        ...answeredQuestionLines,
    ].join('\n');
};