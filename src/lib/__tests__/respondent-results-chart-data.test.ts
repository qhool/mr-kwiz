import { describe, expect, it } from 'vitest';

import type { Trait } from '../quiz-definition';
import {
    buildBidirectionalBarData,
    buildSpiderData,
    buildUnidirectionalBarData,
    getDomainMax,
} from '../respondent-results-chart-data';
import type { TraitStatistics } from '../respondent-quiz';

const traits: Trait[] = [
    {
        id: 'trait-a',
        label: 'Trait A',
        description: '',
        low_label: 'Low A',
        high_label: 'High A',
        display_order: 1,
    },
    {
        id: 'trait-b',
        label: 'Trait B',
        description: '',
        low_label: 'Low B',
        high_label: 'High B',
        display_order: 2,
    },
];

const stats = (overrides: Partial<Record<string, Partial<TraitStatistics>>> = {}): Record<string, TraitStatistics> => ({
    'trait-a': {
        contradiction: 0,
        estimate: 0,
        spread: 0,
        ...overrides['trait-a'],
    },
    'trait-b': {
        contradiction: 0,
        estimate: 0,
        spread: 0,
        ...overrides['trait-b'],
    },
});

describe('getDomainMax', () => {
    it('uses the largest configured scale magnitude when stats stay within bounds', () => {
        expect(getDomainMax(-4, 3, traits, stats())).toBe(4);
    });

    it('expands the domain when an estimate plus spread exceeds the configured scale', () => {
        expect(
            getDomainMax(-2, 2, traits, stats({ 'trait-b': { estimate: -3.5, spread: 1.25 } }))
        ).toBe(4.75);
    });

    it('never returns less than one', () => {
        expect(getDomainMax(0, 0, traits, {})).toBe(1);
    });
});

describe('buildSpiderData', () => {
    it('builds bidirectional low and high points from negative and positive estimates', () => {
        const data = buildSpiderData(
            traits,
            stats({
                'trait-a': { estimate: -2, spread: 0.5 },
                'trait-b': { estimate: 1.5, spread: 0.25 },
            }),
            'bidirectional',
            3
        );

        expect(data).toEqual([
            { estimate: 2, inner: 1.5, label: 'Low A', outer: 2.5, traitId: 'trait-a' },
            { estimate: 0, inner: 0, label: 'Low B', outer: 0, traitId: 'trait-b' },
            { estimate: 0, inner: 0, label: 'High A', outer: 0, traitId: 'trait-a' },
            { estimate: 1.5, inner: 1.25, label: 'High B', outer: 1.75, traitId: 'trait-b' },
        ]);
    });

    it('uses trait labels and clamps negative estimates to zero in unidirectional mode', () => {
        const data = buildSpiderData(
            traits,
            stats({
                'trait-a': { estimate: -3, spread: 2 },
                'trait-b': { estimate: 4.5, spread: 2 },
            }),
            'unidirectional',
            5
        );

        expect(data).toEqual([
            { estimate: 0, inner: 0, label: 'Trait A', outer: 0, traitId: 'trait-a' },
            { estimate: 4.5, inner: 2.5, label: 'Trait B', outer: 5, traitId: 'trait-b' },
        ]);
    });

    it('defaults missing trait statistics to zeroed points', () => {
        expect(buildSpiderData(traits, {}, 'unidirectional', 3)).toEqual([
            { estimate: 0, inner: 0, label: 'Trait A', outer: 0, traitId: 'trait-a' },
            { estimate: 0, inner: 0, label: 'Trait B', outer: 0, traitId: 'trait-b' },
        ]);
    });
});

describe('buildBidirectionalBarData', () => {
    it('splits positive and negative estimates into core and spread bands', () => {
        expect(
            buildBidirectionalBarData(
                traits,
                stats({
                    'trait-a': { estimate: -3, spread: 1 },
                    'trait-b': { estimate: 2.5, spread: 0.5 },
                })
            )
        ).toEqual([
            {
                core: -2,
                estimate: -3,
                highLabel: 'High A',
                id: 'trait-a',
                lowLabel: 'Low A',
                spreadBand: -1,
                traitId: 'trait-a',
            },
            {
                core: 2,
                estimate: 2.5,
                highLabel: 'High B',
                id: 'trait-b',
                lowLabel: 'Low B',
                spreadBand: 0.5,
                traitId: 'trait-b',
            },
        ]);
    });

    it('caps the spread band at the estimate magnitude', () => {
        expect(
            buildBidirectionalBarData(traits.slice(0, 1), stats({ 'trait-a': { estimate: 1, spread: 2 } }))
        ).toEqual([
            {
                core: 0,
                estimate: 1,
                highLabel: 'High A',
                id: 'trait-a',
                lowLabel: 'Low A',
                spreadBand: 1,
                traitId: 'trait-a',
            },
        ]);
    });
});

describe('buildUnidirectionalBarData', () => {
    it('clamps negative estimates to zero and uses trait labels as bar ids', () => {
        expect(
            buildUnidirectionalBarData(
                traits,
                stats({
                    'trait-a': { estimate: -2, spread: 1 },
                    'trait-b': { estimate: 3, spread: 0.75 },
                })
            )
        ).toEqual([
            {
                core: 0,
                estimate: 0,
                id: 'Trait A',
                spreadBand: 0,
                traitId: 'trait-a',
            },
            {
                core: 2.25,
                estimate: 3,
                id: 'Trait B',
                spreadBand: 0.75,
                traitId: 'trait-b',
            },
        ]);
    });

    it('defaults missing stats to zero-valued bars', () => {
        expect(buildUnidirectionalBarData(traits, {})).toEqual([
            {
                core: 0,
                estimate: 0,
                id: 'Trait A',
                spreadBand: 0,
                traitId: 'trait-a',
            },
            {
                core: 0,
                estimate: 0,
                id: 'Trait B',
                spreadBand: 0,
                traitId: 'trait-b',
            },
        ]);
    });
});