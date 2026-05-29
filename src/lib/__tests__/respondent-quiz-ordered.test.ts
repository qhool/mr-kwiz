import { describe, expect, it } from 'vitest';

import {
    getNextQuestionId,
    getOrderedActiveQuestions,
    isQuizComplete,
    type AnsweredQuestion,
} from '../respondent-quiz';
import { makeAnswers, testDefinition } from './fixtures';

const cloneDefinition = () => structuredClone(testDefinition);

describe('getOrderedActiveQuestions', () => {
    it('returns only active questions sorted by display_order', () => {
        const definition = cloneDefinition();
        definition.question_ordering = 'ordered';
        definition.questions[0]!.display_order = 5;
        definition.questions[3]!.display_order = 1;
        definition.questions[1]!.active = false;

        const ordered = getOrderedActiveQuestions(definition);

        expect(ordered.every((question) => question.active)).toBe(true);
        expect(ordered.map((question) => question.id)).toEqual([
            'q04',
            'q03',
            'q01',
            'q05',
            'q06',
            'q07',
            'q08',
            'q09',
            'q10',
        ]);
        expect(ordered.map((question) => question.display_order)).toEqual([1, 3, 5, 5, 6, 7, 8, 9, 10]);
    });
});

describe('getNextQuestionId', () => {
    it('returns the first active question when there are no answers', () => {
        const definition = cloneDefinition();
        definition.question_ordering = 'ordered';

        expect(getNextQuestionId(definition, [])).toBe('q01');
    });

    it('skips answered active questions and ignores inactive ones', () => {
        const definition = cloneDefinition();
        definition.question_ordering = 'ordered';
        definition.questions[0]!.active = false;

        expect(getNextQuestionId(definition, makeAnswers(['q02', 'q03']))).toBe('q04');
    });

    it('treats duplicate answers to the same question as already answered once', () => {
        const definition = cloneDefinition();
        definition.question_ordering = 'ordered';
        const answers: AnsweredQuestion[] = [
            ...makeAnswers(['q01']),
            {
                answer_id: 'q01-r2',
                answered_at: '2026-05-29T12:00:10.000Z',
                question_id: 'q01',
            },
        ];

        expect(getNextQuestionId(definition, answers)).toBe('q02');
    });

    it('returns null once every active question is answered', () => {
        const activeIds = testDefinition.questions
            .filter((question) => question.active)
            .map((question) => question.id);

        expect(getNextQuestionId(cloneDefinition(), makeAnswers(activeIds))).toBeNull();
    });
});

describe('isQuizComplete', () => {
    it('returns false when an active question remains unanswered', () => {
        expect(isQuizComplete(cloneDefinition(), makeAnswers(['q01', 'q02']))).toBe(false);
    });

    it('returns true when all active questions are answered', () => {
        const activeIds = testDefinition.questions
            .filter((question) => question.active)
            .map((question) => question.id);

        expect(isQuizComplete(cloneDefinition(), makeAnswers(activeIds))).toBe(true);
    });

    it('returns true when the only unanswered questions are inactive', () => {
        const definition = cloneDefinition();
        definition.questions
            .filter((question) => question.id === 'q03' || question.id === 'q04')
            .forEach((question) => {
                question.active = false;
            });

        const answeredIds = definition.questions
            .filter((question) => question.active)
            .map((question) => question.id);

        expect(isQuizComplete(definition, makeAnswers(answeredIds))).toBe(true);
    });
});