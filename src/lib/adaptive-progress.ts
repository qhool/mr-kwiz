import type { QuizDefinition } from './quiz-definition';
import {
    computeRespondentScores,
    type AnsweredQuestion,
} from './respondent-quiz';
import type { AdaptiveProgressPhase } from './adaptive-progress-phases';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const weightedAverage = (values: number[], weights: number[]): number => {
    let totalWeight = 0;
    let sum = 0;

    for (let i = 0; i < values.length; i++) {
        const weight = weights[i] ?? 0;
        if (weight > 0) {
            totalWeight += weight;
            sum += (values[i] ?? 0) * weight;
        }
    }

    if (totalWeight > 0) {
        return sum / totalWeight;
    }

    if (values.length === 0) {
        return 0;
    }

    return values.reduce((acc, value) => acc + value, 0) / values.length;
};

export const computeAdaptiveCompletionPercent = (
    definition: QuizDefinition,
    answers: AnsweredQuestion[]
): number => {
    const cfg = definition.scoring_config.adaptive_selection;
    if (!cfg) {
        return 0;
    }

    const answeredCount = answers.length;
    const minQuestions = Math.max(1, cfg.min_questions);
    const scoreSummary = computeRespondentScores(definition, answers);

    const countProgress = clamp01(answeredCount / minQuestions);

    const traitProgress = cfg.target_info.map((targetInfo, index) => {
        const target = targetInfo ?? 0;
        if (target <= 0) {
            return 1;
        }
        const current = scoreSummary.currentInfo[index] ?? 0;
        return clamp01(current / target);
    });

    const signalProgress = weightedAverage(traitProgress, cfg.trait_priority);

    const completion =
        answeredCount < minQuestions
            ? 0.6 * countProgress
            : 0.6 + 0.4 * signalProgress;

    return clamp01(completion) * 100;
};

export const findAdaptivePhaseForPercent = (
    phases: AdaptiveProgressPhase[],
    percent: number
): AdaptiveProgressPhase | null => {
    if (phases.length === 0) {
        return null;
    }

    const clamped = Math.max(0, Math.min(100, percent));
    const lastIndex = phases.length - 1;

    for (let i = 0; i < phases.length; i++) {
        const phase = phases[i]!;
        const inRange =
            i === lastIndex
                ? clamped >= phase.minPercent && clamped <= phase.maxPercent
                : clamped >= phase.minPercent && clamped < phase.maxPercent;
        if (inRange) {
            return phase;
        }
    }

    return phases[lastIndex] ?? null;
};
