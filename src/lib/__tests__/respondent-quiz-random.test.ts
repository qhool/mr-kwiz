import { describe, expect, it } from 'vitest';

import { getNextRandomQuestionId, getRandomOrderedActiveQuestions } from '../respondent-quiz';
import { makeAnswers, testDefinition } from './fixtures';

describe('getRandomOrderedActiveQuestions', () => {
    it('returns all active questions exactly once', () => {
        const result = getRandomOrderedActiveQuestions(testDefinition, 'key1');
        const activeIds = testDefinition.questions
            .filter((question) => question.active)
            .map((question) => question.id)
            .sort();

        expect(result.map((question) => question.id).sort()).toEqual(activeIds);
    });

    it('is deterministic for the same response key', () => {
        const first = getRandomOrderedActiveQuestions(testDefinition, 'same-key');
        const second = getRandomOrderedActiveQuestions(testDefinition, 'same-key');

        expect(first.map((question) => question.id)).toEqual(second.map((question) => question.id));
    });

    it('changes order for different response keys', () => {
        const first = getRandomOrderedActiveQuestions(testDefinition, 'key-alpha');
        const second = getRandomOrderedActiveQuestions(testDefinition, 'key-beta');

        const sameOrder = first.every((question, index) => question.id === second[index]?.id);
        expect(sameOrder).toBe(false);
    });

    it('returns only active questions', () => {
        const result = getRandomOrderedActiveQuestions(testDefinition, 'key1');

        expect(result.every((question) => question.active)).toBe(true);
    });
});

describe('getNextRandomQuestionId', () => {
    it('returns the first unanswered question in the shuffled order', () => {
        const shuffled = getRandomOrderedActiveQuestions(testDefinition, 'key1');

        expect(getNextRandomQuestionId(testDefinition, [], 'key1')).toBe(shuffled[0]?.id ?? null);
    });

    it('skips answered questions', () => {
        const shuffled = getRandomOrderedActiveQuestions(testDefinition, 'key1');
        const answers = makeAnswers([shuffled[0]!.id]);

        expect(getNextRandomQuestionId(testDefinition, answers, 'key1')).toBe(shuffled[1]?.id ?? null);
    });

    it('returns null when all active questions are answered', () => {
        const allActiveIds = testDefinition.questions
            .filter((question) => question.active)
            .map((question) => question.id);

        expect(getNextRandomQuestionId(testDefinition, makeAnswers(allActiveIds), 'key1')).toBeNull();
    });
});