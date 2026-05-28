import { describe, expect, it } from 'vitest';

import type { QuizDefinition } from '../quiz-definition';
import type { AdaptiveCandidate } from '../respondent-quiz';
import { computeRespondentScores, isAdaptiveQuizComplete, selectAdaptiveCandidates } from '../respondent-quiz';
import { makeAnswers, testDefinition } from './fixtures';

const cfg = testDefinition.scoring_config.adaptive_selection!;

const getCandidates = (answers: ReturnType<typeof makeAnswers>) => {
    const summary = computeRespondentScores(testDefinition, answers);
    return selectAdaptiveCandidates(testDefinition, answers, new Set(), cfg, summary);
};

describe('isAdaptiveQuizComplete', () => {
    it('returns false below min_questions', () => {
        const answers = makeAnswers(['q01', 'q04']);

        expect(isAdaptiveQuizComplete(testDefinition, answers, getCandidates(answers))).toBe(false);
    });

    it('returns true at max_questions', () => {
        const answers = makeAnswers(
            testDefinition.questions
                .filter((question) => question.active)
                .slice(0, cfg.max_questions)
                .map((question) => question.id)
        );

        expect(isAdaptiveQuizComplete(testDefinition, answers, getCandidates(answers))).toBe(true);
    });

    it('returns true once all traits meet target_info after min_questions', () => {
        const answers = makeAnswers(['q01', 'q02', 'q04', 'q05', 'q06', 'q07']);
        const summary = computeRespondentScores(testDefinition, answers);

        expect(summary.currentInfo.every((info, index) => info >= cfg.target_info[index]!)).toBe(true);
        expect(isAdaptiveQuizComplete(testDefinition, answers, getCandidates(answers))).toBe(true);
    });

    it('returns true when no candidate meets the goodness threshold after min_questions', () => {
        const answers = makeAnswers(['q01', 'q02', 'q03']);
        const noCandidates: AdaptiveCandidate[] = [];

        expect(isAdaptiveQuizComplete(testDefinition, answers, noCandidates)).toBe(true);
    });

    it('returns false mid-quiz when partial coverage still has viable candidates', () => {
        const answers = makeAnswers(['q01', 'q02', 'q03']);
        const candidates = getCandidates(answers);

        expect(candidates.length).toBeGreaterThan(0);
        expect(candidates[0]!.adaptive_goodness).toBeGreaterThanOrEqual(cfg.min_goodness_to_ask);
        expect(isAdaptiveQuizComplete(testDefinition, answers, candidates)).toBe(false);
    });

    it('falls back to ordered completion when adaptive config is absent', () => {
        const definitionWithoutAdaptive: QuizDefinition = {
            ...testDefinition,
            scoring_config: {
                ...testDefinition.scoring_config,
                adaptive_selection: undefined,
            },
        };

        expect(isAdaptiveQuizComplete(definitionWithoutAdaptive, makeAnswers(['q01']), [])).toBe(false);
        expect(
            isAdaptiveQuizComplete(
                definitionWithoutAdaptive,
                makeAnswers(
                    definitionWithoutAdaptive.questions
                        .filter((question) => question.active)
                        .map((question) => question.id)
                ),
                []
            )
        ).toBe(true);
    });
});