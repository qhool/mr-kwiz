import type { Trait } from './quiz-definition';
import type { TraitStatistics } from './respondent-quiz';

export type SpiderPoint = {
    estimate: number;
    inner: number;
    label: string;
    outer: number;
    traitId: string;
};

export type BarDatum = {
    core: number;
    estimate: number;
    highLabel?: string;
    id: string;
    lowLabel?: string;
    spreadBand: number;
    traitId: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const getDomainMax = (
    scaleMin: number,
    scaleMax: number,
    traits: Trait[],
    traitStats: Record<string, TraitStatistics>
): number => {
    const statMax = traits.reduce((currentMax, trait) => {
        const stat = traitStats[trait.id];
        if (!stat) {
            return currentMax;
        }

        return Math.max(currentMax, Math.abs(stat.estimate) + stat.spread);
    }, 0);

    return Math.max(1, Math.abs(scaleMin), Math.abs(scaleMax), statMax);
};

export const buildSpiderData = (
    traits: Trait[],
    traitStats: Record<string, TraitStatistics>,
    polarity: 'bidirectional' | 'unidirectional',
    domainMax: number
): SpiderPoint[] => {
    if (polarity === 'bidirectional') {
        const lowPoints: SpiderPoint[] = [];
        const highPoints: SpiderPoint[] = [];

        for (const trait of traits) {
            const stat = traitStats[trait.id] ?? { contradiction: 0, estimate: 0, spread: 0 };

            lowPoints.push({
                estimate: clamp(Math.max(0, -stat.estimate), 0, domainMax),
                inner: clamp(Math.max(0, -(stat.estimate + stat.spread)), 0, domainMax),
                label: trait.low_label,
                outer: clamp(Math.max(0, -(stat.estimate - stat.spread)), 0, domainMax),
                traitId: trait.id,
            });

            highPoints.push({
                estimate: clamp(Math.max(0, stat.estimate), 0, domainMax),
                inner: clamp(Math.max(0, stat.estimate - stat.spread), 0, domainMax),
                label: trait.high_label,
                outer: clamp(Math.max(0, stat.estimate + stat.spread), 0, domainMax),
                traitId: trait.id,
            });
        }

        return [...lowPoints, ...highPoints];
    }

    return traits.map((trait) => {
        const stat = traitStats[trait.id] ?? { contradiction: 0, estimate: 0, spread: 0 };

        return {
            estimate: clamp(Math.max(0, stat.estimate), 0, domainMax),
            inner: clamp(Math.max(0, stat.estimate - stat.spread), 0, domainMax),
            label: trait.label,
            outer: clamp(Math.max(0, stat.estimate + stat.spread), 0, domainMax),
            traitId: trait.id,
        };
    });
};

export const buildBidirectionalBarData = (
    traits: Trait[],
    traitStats: Record<string, TraitStatistics>
): BarDatum[] => {
    return traits.map((trait) => {
        const stat = traitStats[trait.id] ?? { contradiction: 0, estimate: 0, spread: 0 };
        const estimate = stat.estimate;
        const spread = Math.max(0, stat.spread);
        const coreMagnitude = Math.max(0, Math.abs(estimate) - spread);
        const spreadMagnitude = Math.min(spread, Math.abs(estimate));
        const sign = estimate >= 0 ? 1 : -1;

        return {
            core: sign * coreMagnitude,
            estimate,
            highLabel: trait.high_label,
            id: trait.id,
            lowLabel: trait.low_label,
            spreadBand: sign * spreadMagnitude,
            traitId: trait.id,
        };
    });
};

export const buildUnidirectionalBarData = (
    traits: Trait[],
    traitStats: Record<string, TraitStatistics>
): BarDatum[] => {
    return traits.map((trait) => {
        const stat = traitStats[trait.id] ?? { contradiction: 0, estimate: 0, spread: 0 };
        const estimate = Math.max(0, stat.estimate);
        const spread = Math.max(0, stat.spread);
        const coreMagnitude = Math.max(0, estimate - spread);
        const spreadMagnitude = Math.min(spread, estimate);

        return {
            core: coreMagnitude,
            estimate,
            id: trait.label,
            spreadBand: spreadMagnitude,
            traitId: trait.id,
        };
    });
};