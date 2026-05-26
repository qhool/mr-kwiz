import { z } from 'zod';

import type { Archetype, Question, QuizDefinition, Trait } from './quiz-definition';

const RESPONDENT_STORAGE_KEY = 'mrkwiz.respondentSessions.v1';

export const storedRespondentSessionSchema = z.object({
    last_interacted_at: z.string(),
    quiz_title: z.string().min(1),
    response_key: z.string().min(1),
});

export const answeredQuestionSchema = z.object({
    answer_id: z.string().min(1),
    answered_at: z.string(),
    question_id: z.string().min(1),
});

export const respondentInvitationPickupSchema = z.object({
    invitation: z.object({
        id: z.string().uuid(),
        invitation_key: z.string().min(1),
        label: z.string(),
        max_uses: z.number().int().positive().nullable(),
        quiz_id: z.string().uuid(),
        use_count: z.number().int().nonnegative(),
    }),
    quiz: z.object({
        description: z.string(),
        id: z.string().uuid(),
        title: z.string().min(1),
    }),
});

export const respondentPickupCreateResponseSchema = z.object({
    quiz: z.object({
        description: z.string(),
        id: z.string().uuid(),
        title: z.string().min(1),
    }),
    response: z.object({
        response_key: z.string().min(1),
        resume_url: z.string().min(1),
        started_at: z.string(),
    }),
});

export const respondentSessionSchema = z.object({
    answers: z.array(answeredQuestionSchema),
    quiz: z.object({
        description: z.string(),
        id: z.string().uuid(),
        title: z.string().min(1),
    }),
    response: z.object({
        current_question_id: z.string().nullable(),
        id: z.string().uuid(),
        response_key: z.string().min(1),
        started_at: z.string(),
        state: z.enum(['started', 'submitted', 'abandoned', 'revoked']),
        submitted_at: z.string().nullable(),
    }),
    snapshot: z.object({
        definition: z.unknown(),
        definition_version: z.number().int().positive(),
        id: z.string().uuid(),
    }),
});

export const respondentAnswerRequestSchema = z.object({
    answer_id: z.string().min(1),
    question_id: z.string().min(1),
});

export const respondentAnswerResponseSchema = respondentSessionSchema;

export type StoredRespondentSession = z.infer<typeof storedRespondentSessionSchema>;
export type AnsweredQuestion = z.infer<typeof answeredQuestionSchema>;
export type RespondentInvitationPickup = z.infer<typeof respondentInvitationPickupSchema>;
export type RespondentPickupCreateResponse = z.infer<typeof respondentPickupCreateResponseSchema>;
export type RespondentSession = z.infer<typeof respondentSessionSchema>;
export type RespondentAnswerRequest = z.infer<typeof respondentAnswerRequestSchema>;
export type RespondentAnswerResponse = z.infer<typeof respondentAnswerResponseSchema>;

export type TraitStatistics = {
    estimate: number;
    spread: number;
    contradiction: number;
};

export type SelectedArchetypeInfo = {
    main: Archetype;
    subtype?: Archetype;
};

export type SelectedArchetypeDisplay = {
    mainDescription: string;
    mainName: string;
    subtypeDescription?: string;
    subtypeName?: string;
};

export type RespondentSessionScoreSummary = {
    answeredQuestions: Array<{
        answerId: string;
        contributionByTraitId: Record<string, number>;
        question: Question;
        selectedResponseIndex: number;
    }>;
    scores: Record<string, number>;
    selectedArchetype?: SelectedArchetypeInfo;
    traitStats: Record<string, TraitStatistics>;
};

const orderedArchetypes = (definition: QuizDefinition): Archetype[] => {
    return [...(definition.display_config.archetypes ?? [])].sort(
        (left, right) => left.display_order - right.display_order
    );
};

const matchesArchetypeConditions = (
    archetype: Archetype,
    traitStats: Record<string, TraitStatistics>
): boolean => {
    return archetype.trait_conditions.every((condition) => {
        const stat = traitStats[condition.trait_id];
        if (!stat) {
            return false;
        }

        if (condition.score_min !== undefined && stat.estimate < condition.score_min) {
            return false;
        }

        if (condition.score_max !== undefined && stat.estimate > condition.score_max) {
            return false;
        }

        if (condition.contradiction_min !== undefined && stat.contradiction < condition.contradiction_min) {
            return false;
        }

        if (condition.contradiction_max !== undefined && stat.contradiction > condition.contradiction_max) {
            return false;
        }

        return true;
    });
};

const isSubtypeCompatibleWithMain = (subtype: Archetype, mainArchetypeId: string): boolean => {
    if (subtype.is_main) {
        return false;
    }

    if (!subtype.compatibility_mode || subtype.compatibility_main_archetype_ids.length === 0) {
        return true;
    }

    if (subtype.compatibility_mode === 'allow-list') {
        return subtype.compatibility_main_archetype_ids.includes(mainArchetypeId);
    }

    return !subtype.compatibility_main_archetype_ids.includes(mainArchetypeId);
};

export const selectArchetype = (
    definition: QuizDefinition,
    traitStats: Record<string, TraitStatistics>
): SelectedArchetypeInfo | undefined => {
    const archetypes = orderedArchetypes(definition);
    const main = archetypes.find(
        (archetype) => archetype.is_main && matchesArchetypeConditions(archetype, traitStats)
    );

    if (!main) {
        return undefined;
    }

    const subtype = archetypes.find(
        (archetype) =>
            !archetype.is_main &&
            isSubtypeCompatibleWithMain(archetype, main.id) &&
            matchesArchetypeConditions(archetype, traitStats)
    );

    return {
        main,
        subtype,
    };
};

export const getSelectedArchetypeDisplay = (
    selectedArchetype?: SelectedArchetypeInfo
): SelectedArchetypeDisplay | undefined => {
    if (!selectedArchetype) {
        return undefined;
    }

    const { main, subtype } = selectedArchetype;
    const variant = subtype?.variants_by_main_archetype_id?.[main.id];

    return {
        mainDescription: main.description,
        mainName: main.name,
        subtypeDescription: subtype ? variant?.description ?? subtype.description : undefined,
        subtypeName: subtype ? variant?.name ?? subtype.name : undefined,
    };
};

const hasWindow = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const parseStoredSessions = (raw: string | null): StoredRespondentSession[] => {
    if (!raw) {
        return [];
    }

    try {
        return z.array(storedRespondentSessionSchema).parse(JSON.parse(raw));
    } catch {
        return [];
    }
};

const writeStoredSessions = (sessions: StoredRespondentSession[]) => {
    if (!hasWindow()) {
        return;
    }

    window.localStorage.setItem(RESPONDENT_STORAGE_KEY, JSON.stringify(sessions));
};

export const listStoredRespondentSessions = (): StoredRespondentSession[] => {
    if (!hasWindow()) {
        return [];
    }

    return parseStoredSessions(window.localStorage.getItem(RESPONDENT_STORAGE_KEY)).sort(
        (left, right) => new Date(right.last_interacted_at).getTime() - new Date(left.last_interacted_at).getTime()
    );
};

export const saveStoredRespondentSession = (
    session: Pick<StoredRespondentSession, 'quiz_title' | 'response_key'>,
    interactedAt = new Date().toISOString()
) => {
    const existing = listStoredRespondentSessions().filter(
        (entry) => entry.response_key !== session.response_key
    );

    writeStoredSessions([
        {
            last_interacted_at: interactedAt,
            quiz_title: session.quiz_title,
            response_key: session.response_key,
        },
        ...existing,
    ]);
};

export const touchStoredRespondentSession = (responseKey: string, quizTitle?: string) => {
    const existing = listStoredRespondentSessions();
    const current = existing.find((entry) => entry.response_key === responseKey);

    writeStoredSessions([
        {
            last_interacted_at: new Date().toISOString(),
            quiz_title: quizTitle ?? current?.quiz_title ?? 'Untitled Quiz',
            response_key: responseKey,
        },
        ...existing.filter((entry) => entry.response_key !== responseKey),
    ]);
};

export const getMostRecentStoredRespondentSession = (): StoredRespondentSession | null => {
    return listStoredRespondentSessions()[0] ?? null;
};

export const getOrderedActiveQuestions = (definition: QuizDefinition): Question[] => {
    return [...definition.questions]
        .filter((question) => question.active)
        .sort((left, right) => left.display_order - right.display_order);
};

export const getNextQuestionId = (
    definition: QuizDefinition,
    answers: AnsweredQuestion[]
): string | null => {
    const answeredIds = new Set(answers.map((answer) => answer.question_id));

    return (
        getOrderedActiveQuestions(definition).find((question) => !answeredIds.has(question.id))?.id ?? null
    );
};

export const isQuizComplete = (definition: QuizDefinition, answers: AnsweredQuestion[]): boolean => {
    return getNextQuestionId(definition, answers) === null;
};

export const buildInitialTraitScores = (traits: Trait[]): Record<string, number> => {
    return Object.fromEntries(traits.map((trait) => [trait.id, 0]));
};

export const computeRespondentScores = (
    definition: QuizDefinition,
    answers: AnsweredQuestion[]
): RespondentSessionScoreSummary => {
    const traitIds = definition.traits
        .slice()
        .sort((left, right) => left.display_order - right.display_order)
        .map((trait) => trait.id);
    const scores = buildInitialTraitScores(definition.traits);
    const traitAccumulators: Record<string, { weightSum: number; weightedScoreSum: number }> = Object.fromEntries(
        traitIds.map((traitId) => [traitId, { weightSum: 0, weightedScoreSum: 0 }])
    );
    const answeredQuestions: RespondentSessionScoreSummary['answeredQuestions'] = [];
    const questionById = new Map(definition.questions.map((question) => [question.id, question]));
    const traitIndexById = new Map(traitIds.map((traitId, index) => [traitId, index]));

    for (const answer of answers) {
        const question = questionById.get(answer.question_id);
        if (!question) {
            continue;
        }

        const orderedResponses = question.responses
            .slice()
            .sort((left, right) => left.display_order - right.display_order);
        const selectedResponseIndex = orderedResponses.findIndex(
            (response) => response.id === answer.answer_id
        );

        if (selectedResponseIndex === -1) {
            continue;
        }

        const contributionByTraitId = Object.fromEntries(traitIds.map((traitId) => [traitId, 0]));

        for (const [traitIndex, traitId] of traitIds.entries()) {
            const matrixIndex = selectedResponseIndex * traitIds.length + traitIndex;
            const score = question.score_matrix.values[matrixIndex] ?? 0;
            const information = question.information_matrix.values[matrixIndex] ?? 0;
            
            contributionByTraitId[traitId] = score;
            scores[traitId] = (scores[traitId] ?? 0) + score;
            
            // Accumulate for weighted statistics
            const accum = traitAccumulators[traitId];
            accum.weightSum += information;
            accum.weightedScoreSum += information * score;
        }

        answeredQuestions.push({
            answerId: answer.answer_id,
            contributionByTraitId,
            question,
            selectedResponseIndex,
        });
    }

    // Compute estimate and spread for each trait
    const finalTraitStats: Record<string, TraitStatistics> = {};
    for (const traitId of traitIds) {
        const accum = traitAccumulators[traitId];
        const estimate = accum.weightSum > 0 ? accum.weightedScoreSum / accum.weightSum : 0;
        
        // Compute variance using the estimate
        let squaredErrorSum = 0;
        for (const answer of answers) {
            const question = questionById.get(answer.question_id);
            if (!question) continue;
            
            const orderedResponses = question.responses
                .slice()
                .sort((left, right) => left.display_order - right.display_order);
            const selectedResponseIndex = orderedResponses.findIndex(
                (response) => response.id === answer.answer_id
            );
            
            if (selectedResponseIndex === -1) continue;
            
            const traitIndex = traitIndexById.get(traitId);
            if (traitIndex === undefined) {
                continue;
            }
            const matrixIndex = selectedResponseIndex * traitIds.length + traitIndex;
            const score = question.score_matrix.values[matrixIndex] ?? 0;
            const information = question.information_matrix.values[matrixIndex] ?? 0;
            
            squaredErrorSum += information * Math.pow(score - estimate, 2);
        }
        
        const contradiction = accum.weightSum > 0 ? squaredErrorSum / accum.weightSum : 0;
        const spread = Math.sqrt(contradiction);
        
        finalTraitStats[traitId] = {
            estimate,
            spread,
            contradiction,
        };
    }

    return {
        answeredQuestions,
        scores,
        selectedArchetype: selectArchetype(definition, finalTraitStats),
        traitStats: finalTraitStats,
    };
};

export const getStrongSignalQuestionIdsByTrait = (
    definition: QuizDefinition,
    answers: AnsweredQuestion[],
    limit = 3
): Record<string, string[]> => {
    const scoreSummary = computeRespondentScores(definition, answers);
    const traitIds = definition.traits
        .slice()
        .sort((left, right) => left.display_order - right.display_order)
        .map((trait) => trait.id);

    return Object.fromEntries(
        traitIds.map((traitId) => {
            const rankedQuestionIds = scoreSummary.answeredQuestions
                .slice()
                .sort(
                    (left, right) =>
                        Math.abs(right.contributionByTraitId[traitId] ?? 0) -
                        Math.abs(left.contributionByTraitId[traitId] ?? 0)
                )
                .filter((entry) => Math.abs(entry.contributionByTraitId[traitId] ?? 0) > 0)
                .slice(0, limit)
                .map((entry) => entry.question.id);

            return [traitId, rankedQuestionIds];
        })
    );
};