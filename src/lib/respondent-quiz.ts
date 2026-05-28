import { z } from 'zod';

import { resultSharingModeSchema } from './admin-invitations';
import type { Archetype, AdaptiveSelectionConfig, Question, QuizDefinition, Trait } from './quiz-definition';

const RESPONDENT_STORAGE_KEY = 'mrkwiz.respondentSessions.v1';
const ADMIN_STORAGE_KEY = 'mrkwiz.adminTokens.v1';
const RESPONDENT_SKIP_INTRO_PREFIX = 'mrkwiz.skipIntroForResponse.';

export const storedRespondentSessionSchema = z.object({
    last_interacted_at: z.string(),
    quiz_title: z.string().min(1),
    response_key: z.string().min(1),
    submitted_at: z.string().nullable().default(null),
});

export const storedAdminSessionSchema = z.object({
    admin_token: z.string().min(1),
    quiz_title: z.string().min(1),
    saved_at: z.string(),
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
        result_sharing_mode: resultSharingModeSchema,
        shareback_name: z.string(),
        use_count: z.number().int().nonnegative(),
    }),
    quiz: z.object({
        description: z.string(),
        id: z.string().uuid(),
        intro_markdown: z.string().optional().default(''),
        title: z.string().min(1),
    }),
});

export const respondentPickupCreateRequestSchema = z.object({
    share_results_with_inviter: z.boolean().optional(),
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
export type StoredAdminSession = z.infer<typeof storedAdminSessionSchema>;
export type AnsweredQuestion = z.infer<typeof answeredQuestionSchema>;
export type RespondentInvitationPickup = z.infer<typeof respondentInvitationPickupSchema>;
export type RespondentPickupCreateRequest = z.infer<typeof respondentPickupCreateRequestSchema>;
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
    currentInfo: number[];    // trait-ordered accumulated information totals
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

const hasSessionStorage = () =>
    typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

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

export const markRespondentIntroSkipped = (responseKey: string) => {
    if (!hasSessionStorage()) {
        return;
    }

    window.sessionStorage.setItem(`${RESPONDENT_SKIP_INTRO_PREFIX}${responseKey}`, '1');
};

export const consumeRespondentIntroSkipped = (responseKey: string): boolean => {
    if (!hasSessionStorage()) {
        return false;
    }

    const key = `${RESPONDENT_SKIP_INTRO_PREFIX}${responseKey}`;
    const hasSkip = window.sessionStorage.getItem(key) === '1';
    if (hasSkip) {
        window.sessionStorage.removeItem(key);
    }

    return hasSkip;
};

export const saveStoredRespondentSession = (
    session: Pick<StoredRespondentSession, 'quiz_title' | 'response_key'> & { submitted_at?: string | null },
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
            submitted_at: session.submitted_at ?? null,
        },
        ...existing,
    ]);
};

export const touchStoredRespondentSession = (responseKey: string, quizTitle?: string, submittedAt: string | null = null) => {
    const existing = listStoredRespondentSessions();
    const current = existing.find((entry) => entry.response_key === responseKey);

    writeStoredSessions([
        {
            last_interacted_at: new Date().toISOString(),
            quiz_title: quizTitle ?? current?.quiz_title ?? 'Untitled Quiz',
            response_key: responseKey,
            submitted_at: submittedAt ?? current?.submitted_at ?? null,
        },
        ...existing.filter((entry) => entry.response_key !== responseKey),
    ]);
};

export const getMostRecentStoredRespondentSession = (): StoredRespondentSession | null => {
    return listStoredRespondentSessions()[0] ?? null;
};

// Admin token storage functions
const parseStoredAdminSessions = (raw: string | null): StoredAdminSession[] => {
    if (!raw) {
        return [];
    }

    try {
        return z.array(storedAdminSessionSchema).parse(JSON.parse(raw));
    } catch {
        return [];
    }
};

const writeStoredAdminSessions = (sessions: StoredAdminSession[]) => {
    if (!hasWindow()) {
        return;
    }

    window.localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(sessions));
};

export const listStoredAdminSessions = (): StoredAdminSession[] => {
    if (!hasWindow()) {
        return [];
    }

    return parseStoredAdminSessions(window.localStorage.getItem(ADMIN_STORAGE_KEY)).sort(
        (left, right) => new Date(right.saved_at).getTime() - new Date(left.saved_at).getTime()
    );
};

export const saveStoredAdminSession = (adminToken: string, quizTitle: string, savedAt = new Date().toISOString()) => {
    const existing = listStoredAdminSessions().filter((entry) => entry.admin_token !== adminToken);

    writeStoredAdminSessions([
        {
            admin_token: adminToken,
            quiz_title: quizTitle,
            saved_at: savedAt,
        },
        ...existing,
    ]);
};

export const getMostRecentStoredAdminSession = (): StoredAdminSession | null => {
    return listStoredAdminSessions()[0] ?? null;
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

    // Compute currentInfo: total accumulated information per trait in trait order
    const currentInfo: number[] = traitIds.map((traitId) => traitAccumulators[traitId]?.weightSum ?? 0);

    return {
        answeredQuestions,
        currentInfo,
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

// ──────────────────────────────────────────────────────────────────────────────
// Random mode: deterministic per-session shuffle keyed by response key
// ──────────────────────────────────────────────────────────────────────────────

const seededRandom = (seed: number): (() => number) => {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0x100000000;
    };
};

const stringToSeed = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = Math.imul(31, hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return hash;
};

export const getRandomOrderedActiveQuestions = (definition: QuizDefinition, responseKey: string): Question[] => {
    const questions = getOrderedActiveQuestions(definition);
    const rng = seededRandom(stringToSeed(responseKey));
    const shuffled = [...questions];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled;
};

export const getNextRandomQuestionId = (
    definition: QuizDefinition,
    answers: AnsweredQuestion[],
    responseKey: string
): string | null => {
    const answeredIds = new Set(answers.map((a) => a.question_id));
    return getRandomOrderedActiveQuestions(definition, responseKey).find((q) => !answeredIds.has(q.id))?.id ?? null;
};

// ──────────────────────────────────────────────────────────────────────────────
// Adaptive mode: information-gain candidate selection
// ──────────────────────────────────────────────────────────────────────────────

export type AdaptiveCandidate = {
    question_id: string;
    expected_info: number[];
    axis_purity: number;
    need_aligned_gain: number;
    off_axis_penalty: number;
    recent_redundancy_penalty: number;
    skipped_penalty: number;
    batch_diversity_penalty: number;
    raw_adaptive_score: number;
    adaptive_goodness: number;
    top_target_traits: string[];
};

const dot = (a: number[], b: number[]): number => a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0);

const norm = (a: number[]): number => Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));

const cosine = (a: number[], b: number[]): number => {
    const nb = norm(b);
    if (nb === 0) return 1;
    const na = norm(a);
    if (na === 0) return 0;
    return dot(a, b) / (na * nb);
};

const computeExpectedInfo = (question: Question, traitCount: number): number[] => {
    const responseCount = question.responses.length;
    if (responseCount === 0) return new Array<number>(traitCount).fill(0);
    const sums = new Array<number>(traitCount).fill(0);
    for (let r = 0; r < responseCount; r++) {
        for (let t = 0; t < traitCount; t++) {
            sums[t] = (sums[t] ?? 0) + (question.information_matrix.values[r * traitCount + t] ?? 0);
        }
    }
    return sums.map((s) => s / responseCount);
};

export const selectAdaptiveCandidates = (
    definition: QuizDefinition,
    answers: AnsweredQuestion[],
    skippedIds: Set<string>,
    cfg: AdaptiveSelectionConfig,
    scoreSummary: RespondentSessionScoreSummary
): AdaptiveCandidate[] => {
    const traitIds = definition.traits
        .slice()
        .sort((left, right) => left.display_order - right.display_order)
        .map((t) => t.id);
    const traitCount = traitIds.length;
    const answeredIds = new Set(answers.map((a) => a.question_id));
    const { currentInfo, traitStats } = scoreSummary;
    const prior_info = definition.scoring_config.prior_info ?? 1;

    const need = traitIds.map((traitId, t) => {
        const info = currentInfo[t] ?? 0;
        const target = cfg.target_info[t] ?? 0;
        const deficit = Math.max(0, target - info);
        const deficitRatio = target > 0 ? deficit / target : 0;
        const coverageNeed = Math.pow(deficitRatio, cfg.need_power);
        const uncertainty = 1 / Math.sqrt(prior_info + info);
        const uncertaintyNeed = cfg.uncertainty_weight * uncertainty;
        const stat = traitStats[traitId];
        const contradictionRatio = stat && stat.contradiction > 0
            ? Math.min(1, stat.contradiction / (cfg.contradiction_target[t] ?? 0.25))
            : 0;
        const contradictionNeed = cfg.contradiction_followup_weight * contradictionRatio * Math.min(1, target > 0 ? info / target : 0);
        return (cfg.trait_priority[t] ?? 1) * (coverageNeed + uncertaintyNeed + contradictionNeed);
    });

    const needSum = need.reduce((s, v) => s + v, 0);
    const epsilon = 1e-9;

    const saturation = traitIds.map((_, t) => {
        const info = currentInfo[t] ?? 0;
        const target = cfg.target_info[t] ?? 0;
        return target > 0 ? Math.max(0, info - target) / target : 0;
    });

    const recentAnswers = answers.slice(-cfg.recent_window);
    const recentExpectedInfos = recentAnswers
        .map((a) => definition.questions.find((q) => q.id === a.question_id))
        .filter((q): q is Question => !!q)
        .map((q) => computeExpectedInfo(q, traitCount));

    const candidatePool = getOrderedActiveQuestions(definition)
        .filter((q) => q.adaptive_eligible && !answeredIds.has(q.id));

    const scored = candidatePool.map((q) => {
        const expectedInfo = computeExpectedInfo(q, traitCount);
        const needAlignedGain = dot(expectedInfo, need);
        const axisPurity = cosine(expectedInfo, need);
        const offAxisPenaltyVal = cfg.off_axis_penalty * dot(expectedInfo, saturation);
        const recentSimilarity = recentExpectedInfos.length > 0
            ? Math.max(...recentExpectedInfos.map((ri) => cosine(expectedInfo, ri)))
            : 0;
        const recentRedundancyPenaltyVal = cfg.recent_redundancy_penalty * recentSimilarity;
        const skippedPenaltyVal = skippedIds.has(q.id) ? cfg.skipped_penalty : 0;
        const rawScore = needAlignedGain - offAxisPenaltyVal - recentRedundancyPenaltyVal - skippedPenaltyVal;
        const adaptiveGoodness = Math.max(0, Math.min(1, rawScore / Math.max(epsilon, needSum)));
        const topTargetTraits = traitIds
            .map((id, i) => ({ id, value: (expectedInfo[i] ?? 0) * (need[i] ?? 0) }))
            .filter((e) => e.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 3)
            .map((e) => e.id);
        return {
            question: q,
            expectedInfo,
            axisPurity,
            needAlignedGain,
            offAxisPenalty: offAxisPenaltyVal,
            recentRedundancyPenalty: recentRedundancyPenaltyVal,
            skippedPenalty: skippedPenaltyVal,
            rawScore,
            adaptiveGoodness,
            topTargetTraits,
        };
    });

    const answeredCount = answers.length;
    const filtered = scored.filter(
        (c) => c.adaptiveGoodness >= cfg.min_goodness_to_ask || answeredCount < cfg.min_questions
    );

    const pool = filtered
        .slice()
        .sort((a, b) => b.rawScore - a.rawScore)
        .slice(0, cfg.candidate_pool_size);

    // Greedy diverse batch selection
    const selected: typeof pool = [];
    const remaining = [...pool];

    while (selected.length < cfg.candidate_count && remaining.length > 0) {
        let bestIndex = 0;
        let bestScore = -Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const candidate = remaining[i]!;
            const diversityPenalty = selected.length > 0
                ? cfg.batch_diversity_penalty * Math.max(...selected.map((s) => cosine(candidate.expectedInfo, s.expectedInfo)))
                : 0;
            const batchScore = candidate.rawScore - diversityPenalty;
            if (batchScore > bestScore) {
                bestScore = batchScore;
                bestIndex = i;
            }
        }
        const pick = remaining.splice(bestIndex, 1)[0]!;
        selected.push(pick);
    }

    return selected.map((c) => ({
        question_id: c.question.id,
        expected_info: c.expectedInfo,
        axis_purity: c.axisPurity,
        need_aligned_gain: c.needAlignedGain,
        off_axis_penalty: c.offAxisPenalty,
        recent_redundancy_penalty: c.recentRedundancyPenalty,
        skipped_penalty: c.skippedPenalty,
        batch_diversity_penalty: 0, // post-hoc per-batch value not recomputed here
        raw_adaptive_score: c.rawScore,
        adaptive_goodness: c.adaptiveGoodness,
        top_target_traits: c.topTargetTraits,
    }));
};

export const isAdaptiveQuizComplete = (
    definition: QuizDefinition,
    answers: AnsweredQuestion[],
    candidates: AdaptiveCandidate[]
): boolean => {
    const cfg = definition.scoring_config.adaptive_selection;
    if (!cfg) return isQuizComplete(definition, answers);

    const answeredCount = answers.length;
    if (answeredCount >= cfg.max_questions) return true;
    if (answeredCount < cfg.min_questions) return false;

    const traitCount = definition.traits.length;
    if (traitCount > 0) {
        const scoreSummary = computeRespondentScores(definition, answers);
        const allCovered = cfg.target_info.every((target, t) => (scoreSummary.currentInfo[t] ?? 0) >= target);
        if (allCovered) return true;
    }

    const bestGoodness = candidates[0]?.adaptive_goodness ?? 0;
    return bestGoodness < cfg.min_goodness_to_ask;
};

// ──────────────────────────────────────────────────────────────────────────────
// Client-only adaptive session state (sessionStorage, per response key)
// ──────────────────────────────────────────────────────────────────────────────

const ADAPTIVE_SKIPPED_PREFIX = 'mrkwiz.adaptiveSkipped.';
const ADAPTIVE_BATCH_PREFIX = 'mrkwiz.adaptiveBatch.';

export const getAdaptiveSkippedIds = (responseKey: string): Set<string> => {
    if (!hasSessionStorage()) return new Set();
    try {
        const raw = window.sessionStorage.getItem(`${ADAPTIVE_SKIPPED_PREFIX}${responseKey}`) ?? '[]';
        return new Set(JSON.parse(raw) as string[]);
    } catch {
        return new Set();
    }
};

export const addAdaptiveSkippedId = (responseKey: string, questionId: string): void => {
    if (!hasSessionStorage()) return;
    const current = getAdaptiveSkippedIds(responseKey);
    current.add(questionId);
    window.sessionStorage.setItem(`${ADAPTIVE_SKIPPED_PREFIX}${responseKey}`, JSON.stringify([...current]));
};

export const getAdaptiveBatch = (responseKey: string): AdaptiveCandidate[] => {
    if (!hasSessionStorage()) return [];
    try {
        const raw = window.sessionStorage.getItem(`${ADAPTIVE_BATCH_PREFIX}${responseKey}`);
        if (!raw) return [];
        return JSON.parse(raw) as AdaptiveCandidate[];
    } catch {
        return [];
    }
};

export const setAdaptiveBatch = (responseKey: string, batch: AdaptiveCandidate[]): void => {
    if (!hasSessionStorage()) return;
    window.sessionStorage.setItem(`${ADAPTIVE_BATCH_PREFIX}${responseKey}`, JSON.stringify(batch));
};

export const clearAdaptiveSessionState = (responseKey: string): void => {
    if (!hasSessionStorage()) return;
    window.sessionStorage.removeItem(`${ADAPTIVE_SKIPPED_PREFIX}${responseKey}`);
    window.sessionStorage.removeItem(`${ADAPTIVE_BATCH_PREFIX}${responseKey}`);
};