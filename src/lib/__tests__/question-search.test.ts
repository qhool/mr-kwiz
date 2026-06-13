import { describe, expect, it } from 'vitest';

import { getAllQuestionSearchSummaryVectors, QUESTION_SEARCH_SUMMARY_VECTORS, searchQuestions } from '../question-search';
import { testDefinition } from './fixtures';

describe('searchQuestions', () => {
    it('filters by keywords, trait metrics, and paginates results', async () => {
        const result = await searchQuestions(testDefinition, {
            keywords: ['prompt'],
            trait_filters: [{ trait_id: 'trait-a', abs_signal_min: 1, expected_information_min: 1 }],
            include_fields: ['id', 'prompt', 'trait_metrics'],
            limit: 2,
            offset: 1,
        });

        expect(result.ok).toBe(true);
        expect(result.pagination).toMatchObject({
            total_matches: 3,
            offset: 1,
            limit: 2,
            returned: 2,
            has_more: false,
            next_offset: null,
        });
        expect(result.questions.map((question) => question.id)).toEqual(['q02', 'q03']);
        expect(result.questions[0]?.trait_metrics?.['trait-a']).toMatchObject({
            signal_min: -0.5,
            signal_max: 1,
            max_abs_signal: 1,
            expected_information: 1.5,
        });
    });

    it('computes requested summary vectors over all matches before pagination', async () => {
        const result = await searchQuestions(testDefinition, {
            active: true,
            include_fields: ['id'],
            include_summary_vectors: ['max_abs_signal', 'max_expected_information', 'coverage_count'],
            limit: 1,
        });

        expect(result.ok).toBe(true);
        expect(result.pagination.total_matches).toBe(10);
        expect(result.questions).toEqual([{ id: 'q01' }]);
        expect(result.summary_vectors).toEqual({
            max_abs_signal: [1, 1, 1],
            max_expected_information: [1.5, 1.5, 1.5],
            coverage_count: [10, 10, 10],
        });
    });

    it('computes all summary vectors for quiz context reuse', () => {
        const result = getAllQuestionSearchSummaryVectors(testDefinition);

        expect(result.trait_order).toEqual(['trait-a', 'trait-b', 'trait-c']);
        expect(Object.keys(result.summary_vectors)).toEqual([...QUESTION_SEARCH_SUMMARY_VECTORS]);
        expect(result.summary_vectors).toMatchObject({
            max_abs_signal: [1, 1, 1],
            max_expected_information: [1.5, 1.5, 1.5],
            coverage_count: [12, 12, 12],
        });
    });

    it('returns stable hashes only when requested', async () => {
        const withoutHash = await searchQuestions(testDefinition, {
            include_fields: ['id'],
            keywords: ['q01'],
        });
        const withHash = await searchQuestions(testDefinition, {
            include_fields: ['id', 'old_question_hash'],
            keywords: ['q01'],
        });

        expect(withoutHash.questions[0]).toEqual({ id: 'q01' });
        expect(withHash.questions[0]?.old_question_hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('reports invalid trait filters and unknown include values', async () => {
        const result = await searchQuestions(testDefinition, {
            trait_filters: [{ trait_id: 'missing-trait' }],
            include_fields: ['id', 'not-a-field'],
            include_summary_vectors: ['coverage_count', 'not-a-vector'],
        });

        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
            {
                code: 'UNKNOWN_TRAIT',
                message: 'Trait missing-trait was not found.',
                path: '/trait_filters/0/trait_id',
            },
        ]);
        expect(result.warnings.map((warning) => warning.code)).toEqual([
            'UNKNOWN_INCLUDE_FIELD',
            'UNKNOWN_SUMMARY_VECTOR',
        ]);
    });

    it('rejects malformed keyword and tag filters instead of broadening the search', async () => {
        const keywordResult = await searchQuestions(testDefinition, {
            keywords: 'prompt',
        });
        const tagResult = await searchQuestions(testDefinition, {
            tags: 'anything',
        });

        expect(keywordResult.ok).toBe(false);
        expect(keywordResult.errors).toContainEqual({
            code: 'INVALID_SEARCH_PARAM',
            message: 'keywords must be an array of strings.',
            path: '/keywords',
        });
        expect(keywordResult.pagination.total_matches).toBe(0);
        expect(keywordResult.questions).toEqual([]);
        expect(tagResult.ok).toBe(false);
        expect(tagResult.errors).toContainEqual({
            code: 'INVALID_SEARCH_PARAM',
            message: 'tags must be an array of strings.',
            path: '/tags',
        });
        expect(tagResult.pagination.total_matches).toBe(0);
        expect(tagResult.questions).toEqual([]);
    });

    it('warns for malformed output selectors and unknown trait filter fields', async () => {
        const result = await searchQuestions(testDefinition, {
            include_fields: ['id'],
            include_summary_vectors: true,
            trait_filters: [{ trait_id: 'trait-a', min_score: 1 }],
        });

        expect(result.ok).toBe(true);
        expect(result.warnings).toEqual([
            {
                code: 'INVALID_SEARCH_PARAM',
                message: 'include_summary_vectors must be an array of strings.',
                path: '/include_summary_vectors',
            },
            {
                code: 'UNKNOWN_TRAIT_FILTER_FIELD',
                message: 'Unknown trait filter field min_score was ignored.',
                path: '/trait_filters/0/min_score',
            },
        ]);
    });

    it('warns when offset is clamped to zero', async () => {
        const result = await searchQuestions(testDefinition, {
            include_fields: ['id'],
            offset: -5,
        });

        expect(result.ok).toBe(true);
        expect(result.pagination.offset).toBe(0);
        expect(result.warnings).toContainEqual({
            code: 'OFFSET_CLAMPED',
            message: 'offset was clamped to a non-negative integer.',
            path: '/offset',
        });
    });

    it('does not search response labels by default but can search them explicitly', async () => {
        const defaultResult = await searchQuestions(testDefinition, {
            keywords: ['response'],
            include_fields: ['id'],
        });
        const responseResult = await searchQuestions(testDefinition, {
            keywords: ['response'],
            keyword_fields: ['responses'],
            include_fields: ['id'],
        });

        expect(defaultResult.ok).toBe(true);
        expect(defaultResult.pagination.total_matches).toBe(0);
        expect(defaultResult.questions).toEqual([]);
        expect(responseResult.ok).toBe(true);
        expect(responseResult.pagination.total_matches).toBe(12);
        expect(responseResult.questions[0]).toEqual({ id: 'q01' });
    });
});
