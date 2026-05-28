import { beforeEach, describe, expect, it } from 'vitest';

import {
    addAdaptiveSkippedId,
    clearAdaptiveSessionState,
    getAdaptiveBatch,
    getAdaptiveSkippedIds,
    setAdaptiveBatch,
} from '../respondent-quiz';
import type { AdaptiveCandidate } from '../respondent-quiz';

const KEY = 'response-key';
const OTHER_KEY = 'other-response-key';

const candidate = (id: string): AdaptiveCandidate => ({
    question_id: id,
    expected_info: [1, 0, 0],
    axis_purity: 0.9,
    need_aligned_gain: 1,
    off_axis_penalty: 0,
    recent_redundancy_penalty: 0,
    skipped_penalty: 0,
    batch_diversity_penalty: 0,
    raw_adaptive_score: 1,
    adaptive_goodness: 0.8,
    top_target_traits: ['trait-a'],
});

describe('adaptive session storage helpers', () => {
    beforeEach(() => {
        window.sessionStorage.clear();
    });

    it('returns empty state for unknown keys', () => {
        expect(getAdaptiveSkippedIds(KEY).size).toBe(0);
        expect(getAdaptiveBatch(KEY)).toEqual([]);
    });

    it('accumulates skipped ids for a response key', () => {
        addAdaptiveSkippedId(KEY, 'q01');
        addAdaptiveSkippedId(KEY, 'q02');

        expect([...getAdaptiveSkippedIds(KEY)].sort()).toEqual(['q01', 'q02']);
    });

    it('keeps skipped ids isolated per response key', () => {
        addAdaptiveSkippedId(KEY, 'q01');

        expect(getAdaptiveSkippedIds(OTHER_KEY).size).toBe(0);
    });

    it('round-trips adaptive batches', () => {
        const batch = [candidate('q01'), candidate('q02')];
        setAdaptiveBatch(KEY, batch);

        expect(getAdaptiveBatch(KEY)).toEqual(batch);
    });

    it('clears skipped ids and batches for the targeted key only', () => {
        addAdaptiveSkippedId(KEY, 'q01');
        setAdaptiveBatch(KEY, [candidate('q01')]);
        addAdaptiveSkippedId(OTHER_KEY, 'q99');
        setAdaptiveBatch(OTHER_KEY, [candidate('q99')]);

        clearAdaptiveSessionState(KEY);

        expect(getAdaptiveSkippedIds(KEY).size).toBe(0);
        expect(getAdaptiveBatch(KEY)).toEqual([]);
        expect([...getAdaptiveSkippedIds(OTHER_KEY)]).toEqual(['q99']);
        expect(getAdaptiveBatch(OTHER_KEY)).toEqual([candidate('q99')]);
    });
});