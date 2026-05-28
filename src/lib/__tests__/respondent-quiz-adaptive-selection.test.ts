import { describe, expect, it } from 'vitest';

import { computeRespondentScores, selectAdaptiveCandidates } from '../respondent-quiz';
import { makeAnswers, testDefinition } from './fixtures';

const cfg = testDefinition.scoring_config.adaptive_selection!;

describe('selectAdaptiveCandidates', () => {
    it('returns candidate_count candidates with zero answers', () => {
        const summary = computeRespondentScores(testDefinition, []);

        expect(selectAdaptiveCandidates(testDefinition, [], new Set(), cfg, summary)).toHaveLength(
            cfg.candidate_count
        );
    });

    it('returns only adaptive-eligible unanswered questions', () => {
        const answers = makeAnswers(['q01', 'q02']);
        const summary = computeRespondentScores(testDefinition, answers);
        const candidates = selectAdaptiveCandidates(testDefinition, answers, new Set(), cfg, summary);
        const questionById = new Map(testDefinition.questions.map((question) => [question.id, question]));

        expect(candidates.every((candidate) => {
            const question = questionById.get(candidate.question_id);
            return Boolean(question?.active && question.adaptive_eligible && !['q01', 'q02'].includes(question.id));
        })).toBe(true);
    });

    it('penalizes a skipped top candidate enough to displace or reduce it', () => {
        const summary = computeRespondentScores(testDefinition, []);
        const baseline = selectAdaptiveCandidates(testDefinition, [], new Set(), cfg, summary);
        const skippedQuestionId = baseline[0]!.question_id;
        const withSkip = selectAdaptiveCandidates(testDefinition, [], new Set([skippedQuestionId]), cfg, summary);
        const skippedCandidate = withSkip.find((candidate) => candidate.question_id === skippedQuestionId);

        if (!skippedCandidate) {
            expect(withSkip.some((candidate) => candidate.question_id === skippedQuestionId)).toBe(false);
            return;
        }

        expect(skippedCandidate.adaptive_goodness).toBeLessThan(
            baseline.find((candidate) => candidate.question_id === skippedQuestionId)!.adaptive_goodness
        );
    });

    it('returns fewer candidates when fewer eligible unanswered questions remain', () => {
        const eligibleIds = testDefinition.questions
            .filter((question) => question.active && question.adaptive_eligible)
            .map((question) => question.id);
        const answers = makeAnswers(eligibleIds.slice(0, eligibleIds.length - 1));
        const summary = computeRespondentScores(testDefinition, answers);
        const candidates = selectAdaptiveCandidates(
            testDefinition,
            answers,
            new Set(),
            {
                ...cfg,
                min_questions: answers.length + 1,
            },
            summary
        );

        expect(candidates).toHaveLength(1);
    });

    it('avoids returning inactive questions', () => {
        const summary = computeRespondentScores(testDefinition, []);
        const inactiveIds = new Set(
            testDefinition.questions.filter((question) => !question.active).map((question) => question.id)
        );

        expect(
            selectAdaptiveCandidates(testDefinition, [], new Set(), cfg, summary).every(
                (candidate) => !inactiveIds.has(candidate.question_id)
            )
        ).toBe(true);
    });
});