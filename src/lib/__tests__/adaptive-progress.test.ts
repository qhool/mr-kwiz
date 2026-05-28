import { describe, expect, it } from 'vitest';

import {
    computeAdaptiveCompletionPercent,
    findAdaptivePhaseForPercent,
} from '../adaptive-progress';
import { ADAPTIVE_PROGRESS_PHASES } from '../adaptive-progress-phases';
import { makeAnswers, testDefinition } from './fixtures';

describe('computeAdaptiveCompletionPercent', () => {
    it('uses count progress before min_questions', () => {
        const withOneAnswer = computeAdaptiveCompletionPercent(testDefinition, makeAnswers(['q01']));
        const expected = 100 * (0.6 * (1 / testDefinition.scoring_config.adaptive_selection!.min_questions));

        expect(withOneAnswer).toBeCloseTo(expected, 6);
    });

    it('uses signal progress after min_questions is reached', () => {
        const answers = makeAnswers(['q01', 'q02', 'q04']);
        const percent = computeAdaptiveCompletionPercent(testDefinition, answers);

        expect(percent).toBeGreaterThanOrEqual(60);
        expect(percent).toBeLessThanOrEqual(100);
    });

    it('handles zero target_info entries without division errors', () => {
        const definition = {
            ...testDefinition,
            scoring_config: {
                ...testDefinition.scoring_config,
                adaptive_selection: {
                    ...testDefinition.scoring_config.adaptive_selection!,
                    target_info: [0, 0, 0],
                },
            },
        };
        const percent = computeAdaptiveCompletionPercent(definition, makeAnswers(['q01', 'q02', 'q03']));

        expect(Number.isFinite(percent)).toBe(true);
        expect(percent).toBe(100);
    });

    it('falls back safely when trait priorities sum to zero', () => {
        const definition = {
            ...testDefinition,
            scoring_config: {
                ...testDefinition.scoring_config,
                adaptive_selection: {
                    ...testDefinition.scoring_config.adaptive_selection!,
                    trait_priority: [0, 0, 0],
                },
            },
        };
        const percent = computeAdaptiveCompletionPercent(
            definition,
            makeAnswers(['q01', 'q02', 'q04', 'q05'])
        );

        expect(Number.isFinite(percent)).toBe(true);
        expect(percent).toBeGreaterThanOrEqual(60);
    });
});

describe('findAdaptivePhaseForPercent', () => {
    it('returns the first phase for 0%', () => {
        const phase = findAdaptivePhaseForPercent(ADAPTIVE_PROGRESS_PHASES, 0);

        expect(phase?.id).toBe('p01');
    });

    it('moves to the next phase at a boundary', () => {
        const boundary = ADAPTIVE_PROGRESS_PHASES[0]!.maxPercent;
        const phase = findAdaptivePhaseForPercent(ADAPTIVE_PROGRESS_PHASES, boundary);

        expect(phase?.id).toBe('p02');
    });

    it('returns final phase at 100%', () => {
        const phase = findAdaptivePhaseForPercent(ADAPTIVE_PROGRESS_PHASES, 100);

        expect(phase?.id).toBe('p25');
    });
});
