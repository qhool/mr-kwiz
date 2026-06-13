import { hashQuestion, type Question, type QuizDefinition } from './quiz-definition';

export type SearchToolIssue = {
    code: string;
    message: string;
    path?: string;
};

export type QuestionSearchIncludeField =
    | 'id'
    | 'display_order'
    | 'prompt'
    | 'help_text'
    | 'responses'
    | 'tags'
    | 'active'
    | 'adaptive_eligible'
    | 'trait_metrics'
    | 'old_question_hash';

export const QUESTION_SEARCH_SUMMARY_VECTORS = [
    'max_abs_signal',
    'max_positive_signal',
    'max_negative_signal',
    'max_expected_information',
    'max_uncertainty_resolution',
    'coverage_count',
] as const;

export type QuestionSearchSummaryVector = (typeof QUESTION_SEARCH_SUMMARY_VECTORS)[number];

export type QuestionSearchTraitFilter = {
    trait_id: string;
    signal_min?: number;
    signal_max?: number;
    abs_signal_min?: number;
    abs_signal_max?: number;
    positive_signal_min?: number;
    positive_signal_max?: number;
    negative_signal_min?: number;
    negative_signal_max?: number;
    expected_information_min?: number;
    expected_information_max?: number;
    uncertainty_resolution_min?: number;
    uncertainty_resolution_max?: number;
    coverage_min?: number;
    coverage_max?: number;
};

export type QuestionSearchInput = {
    active?: boolean;
    adaptive_eligible?: boolean;
    include_fields?: QuestionSearchIncludeField[];
    include_summary_vectors?: QuestionSearchSummaryVector[];
    keyword_fields?: Array<'prompt' | 'help_text' | 'responses' | 'response_help_text' | 'tags'>;
    keyword_mode?: 'all' | 'any';
    keywords?: string[];
    limit?: number;
    offset?: number;
    tag_mode?: 'all' | 'any';
    tags?: string[];
    trait_filter_mode?: 'all' | 'any';
    trait_filters?: QuestionSearchTraitFilter[];
};

export type QuestionSearchTraitMetrics = {
    signal_min: number;
    signal_max: number;
    max_abs_signal: number;
    max_positive_signal: number;
    max_negative_signal: number;
    expected_information: number;
    uncertainty_resolution: number;
    coverage: number;
};

export type QuestionSearchResult = {
    ok: boolean;
    errors: SearchToolIssue[];
    warnings: SearchToolIssue[];
    pagination: {
        total_matches: number;
        offset: number;
        limit: number;
        returned: number;
        has_more: boolean;
        next_offset: number | null;
    };
    questions: Array<Partial<{
        active: boolean;
        adaptive_eligible: boolean;
        display_order: number;
        help_text: string;
        id: string;
        old_question_hash: string;
        prompt: string;
        responses: Question['responses'];
        tags: string[];
        trait_metrics: Record<string, QuestionSearchTraitMetrics>;
    }>>;
    summary_vectors?: Partial<Record<QuestionSearchSummaryVector, number[]>>;
    trait_order: string[];
};

const includeFields = new Set<QuestionSearchIncludeField>([
    'id',
    'display_order',
    'prompt',
    'help_text',
    'responses',
    'tags',
    'active',
    'adaptive_eligible',
    'trait_metrics',
    'old_question_hash',
]);

const summaryVectorFields = new Set<QuestionSearchSummaryVector>(QUESTION_SEARCH_SUMMARY_VECTORS);

const keywordFields = new Set(['prompt', 'help_text', 'responses', 'response_help_text', 'tags'] as const);
const defaultKeywordFields: Array<(typeof keywordFields extends Set<infer T> ? T : never)> = ['prompt', 'help_text', 'tags'];
const traitFilterFields = new Set<keyof QuestionSearchTraitFilter>([
    'trait_id',
    'signal_min',
    'signal_max',
    'abs_signal_min',
    'abs_signal_max',
    'positive_signal_min',
    'positive_signal_max',
    'negative_signal_min',
    'negative_signal_max',
    'expected_information_min',
    'expected_information_max',
    'uncertainty_resolution_min',
    'uncertainty_resolution_max',
    'coverage_min',
    'coverage_max',
]);

const defaultIncludeFields: QuestionSearchIncludeField[] = [
    'id',
    'display_order',
    'prompt',
    'tags',
    'active',
    'adaptive_eligible',
];

const invalidParamIssue = (path: string, message: string): SearchToolIssue => ({
    code: 'INVALID_SEARCH_PARAM',
    message,
    path: path || undefined,
});

const toStringArray = (value: unknown, issues: SearchToolIssue[], path: string): string[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        issues.push(invalidParamIssue(path, `${path.slice(1)} must be an array of strings.`));
        return [];
    }

    return value.filter((entry, index): entry is string => {
        if (typeof entry === 'string') return entry.trim().length > 0;
        issues.push(invalidParamIssue(`${path}/${index}`, `${path.slice(1)} entries must be strings.`));
        return false;
    });
};

const toNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

const toBoolean = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

const normalizeMode = (value: unknown, warnings: SearchToolIssue[], path: string): 'all' | 'any' => {
    if (value === undefined) return 'all';
    if (value === 'all' || value === 'any') return value;
    warnings.push(invalidParamIssue(path, `${path.slice(1)} must be "all" or "any". Defaulting to "all".`));
    return 'all';
};

const normalizeIncludeFields = (value: unknown, warnings: SearchToolIssue[]): QuestionSearchIncludeField[] => {
    const fields = toStringArray(value, warnings, '/include_fields');
    if (fields.length === 0) return defaultIncludeFields;

    const accepted: QuestionSearchIncludeField[] = [];
    for (const field of fields) {
        if (includeFields.has(field as QuestionSearchIncludeField)) {
            accepted.push(field as QuestionSearchIncludeField);
        } else {
            warnings.push({
                code: 'UNKNOWN_INCLUDE_FIELD',
                message: `Unknown include field ${field} was ignored.`,
                path: '/include_fields',
            });
        }
    }

    return [...new Set(accepted)];
};

const normalizeSummaryVectors = (value: unknown, warnings: SearchToolIssue[]): QuestionSearchSummaryVector[] => {
    const fields = toStringArray(value, warnings, '/include_summary_vectors');
    const accepted: QuestionSearchSummaryVector[] = [];

    for (const field of fields) {
        if (summaryVectorFields.has(field as QuestionSearchSummaryVector)) {
            accepted.push(field as QuestionSearchSummaryVector);
        } else {
            warnings.push({
                code: 'UNKNOWN_SUMMARY_VECTOR',
                message: `Unknown summary vector ${field} was ignored.`,
                path: '/include_summary_vectors',
            });
        }
    }

    return [...new Set(accepted)];
};

const normalizeKeywordFields = (value: unknown, warnings: SearchToolIssue[]) => {
    const fields = toStringArray(value, warnings, '/keyword_fields');
    if (fields.length === 0) return [...defaultKeywordFields];

    const accepted: Array<(typeof keywordFields extends Set<infer T> ? T : never)> = [];
    for (const field of fields) {
        if (keywordFields.has(field as never)) {
            accepted.push(field as never);
        } else {
            warnings.push({
                code: 'UNKNOWN_KEYWORD_FIELD',
                message: `Unknown keyword field ${field} was ignored.`,
                path: '/keyword_fields',
            });
        }
    }

    return [...new Set(accepted)];
};

const parseTraitFilters = (value: unknown, warnings: SearchToolIssue[], errors: SearchToolIssue[]): QuestionSearchTraitFilter[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        errors.push(invalidParamIssue('/trait_filters', 'trait_filters must be an array of objects.'));
        return [];
    }

    const filters: QuestionSearchTraitFilter[] = [];
    for (let index = 0; index < value.length; index += 1) {
        const entry = value[index];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            errors.push(invalidParamIssue(`/trait_filters/${index}`, 'trait_filters entries must be objects.'));
            continue;
        }

        for (const field of Object.keys(entry)) {
            if (!traitFilterFields.has(field as keyof QuestionSearchTraitFilter)) {
                warnings.push({
                    code: 'UNKNOWN_TRAIT_FILTER_FIELD',
                    message: `Unknown trait filter field ${field} was ignored.`,
                    path: `/trait_filters/${index}/${field}`,
                });
            }
        }

        filters.push({
            trait_id: typeof entry.trait_id === 'string' ? entry.trait_id : '',
            signal_min: toNumber(entry.signal_min),
            signal_max: toNumber(entry.signal_max),
            abs_signal_min: toNumber(entry.abs_signal_min),
            abs_signal_max: toNumber(entry.abs_signal_max),
            positive_signal_min: toNumber(entry.positive_signal_min),
            positive_signal_max: toNumber(entry.positive_signal_max),
            negative_signal_min: toNumber(entry.negative_signal_min),
            negative_signal_max: toNumber(entry.negative_signal_max),
            expected_information_min: toNumber(entry.expected_information_min),
            expected_information_max: toNumber(entry.expected_information_max),
            uncertainty_resolution_min: toNumber(entry.uncertainty_resolution_min),
            uncertainty_resolution_max: toNumber(entry.uncertainty_resolution_max),
            coverage_min: toNumber(entry.coverage_min),
            coverage_max: toNumber(entry.coverage_max),
        });
    }

    return filters;
};

const normalizeInput = (input: unknown, warnings: SearchToolIssue[], errors: SearchToolIssue[]): Required<Pick<QuestionSearchInput, 'keyword_mode' | 'tag_mode' | 'trait_filter_mode'>> & {
    active?: boolean;
    adaptive_eligible?: boolean;
    include_fields: QuestionSearchIncludeField[];
    include_summary_vectors: QuestionSearchSummaryVector[];
    keyword_fields: ReturnType<typeof normalizeKeywordFields>;
    keywords: string[];
    limit: number;
    offset: number;
    tags: string[];
    trait_filters: QuestionSearchTraitFilter[];
} => {
    const params = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    if (input !== undefined && (typeof input !== 'object' || Array.isArray(input) || input === null)) {
        errors.push(invalidParamIssue('', 'Search input must be an object.'));
    }

    if (params.active !== undefined && toBoolean(params.active) === undefined) {
        errors.push(invalidParamIssue('/active', 'active must be a boolean.'));
    }
    if (params.adaptive_eligible !== undefined && toBoolean(params.adaptive_eligible) === undefined) {
        errors.push(invalidParamIssue('/adaptive_eligible', 'adaptive_eligible must be a boolean.'));
    }
    if (params.limit !== undefined && toNumber(params.limit) === undefined) {
        errors.push(invalidParamIssue('/limit', 'limit must be a finite number.'));
    }
    if (params.offset !== undefined && toNumber(params.offset) === undefined) {
        errors.push(invalidParamIssue('/offset', 'offset must be a finite number.'));
    }

    const rawLimit = toNumber(params.limit) ?? 20;
    const limit = Math.max(1, Math.min(100, Math.trunc(rawLimit)));
    if (rawLimit !== limit) {
        warnings.push({ code: 'LIMIT_CLAMPED', message: 'limit was clamped to the range 1..100.', path: '/limit' });
    }
    const rawOffset = toNumber(params.offset) ?? 0;
    const offset = Math.max(0, Math.trunc(rawOffset));
    if (rawOffset !== offset) {
        warnings.push({ code: 'OFFSET_CLAMPED', message: 'offset was clamped to a non-negative integer.', path: '/offset' });
    }

    return {
        active: toBoolean(params.active),
        adaptive_eligible: toBoolean(params.adaptive_eligible),
        include_fields: normalizeIncludeFields(params.include_fields, warnings),
        include_summary_vectors: normalizeSummaryVectors(params.include_summary_vectors, warnings),
        keyword_fields: normalizeKeywordFields(params.keyword_fields, warnings),
        keyword_mode: normalizeMode(params.keyword_mode, warnings, '/keyword_mode'),
        keywords: toStringArray(params.keywords, errors, '/keywords').map((entry) => entry.trim().toLowerCase()),
        limit,
        offset,
        tag_mode: normalizeMode(params.tag_mode, warnings, '/tag_mode'),
        tags: toStringArray(params.tags, errors, '/tags').map((entry) => entry.trim().toLowerCase()),
        trait_filter_mode: normalizeMode(params.trait_filter_mode, warnings, '/trait_filter_mode'),
        trait_filters: parseTraitFilters(params.trait_filters, warnings, errors),
    };
};

const getTraitOrder = (definition: QuizDefinition): string[] =>
    definition.traits
        .slice()
        .sort((left, right) => left.display_order - right.display_order)
        .map((trait) => trait.id);

const getQuestionMetrics = (question: Question, traitOrder: string[], priorInfo: number): Record<string, QuestionSearchTraitMetrics> => {
    const metrics: Record<string, QuestionSearchTraitMetrics> = {};
    const responseCount = question.responses.length;

    for (let traitIndex = 0; traitIndex < traitOrder.length; traitIndex += 1) {
        const traitId = traitOrder[traitIndex]!;
        let signalMin = Number.POSITIVE_INFINITY;
        let signalMax = Number.NEGATIVE_INFINITY;
        let informationSum = 0;

        for (let responseIndex = 0; responseIndex < responseCount; responseIndex += 1) {
            const matrixIndex = responseIndex * traitOrder.length + traitIndex;
            const signal = question.score_matrix.values[matrixIndex] ?? 0;
            signalMin = Math.min(signalMin, signal);
            signalMax = Math.max(signalMax, signal);
            informationSum += question.information_matrix.values[matrixIndex] ?? 0;
        }

        if (responseCount === 0) {
            signalMin = 0;
            signalMax = 0;
        }

        const expectedInformation = responseCount > 0 ? informationSum / responseCount : 0;
        const maxPositiveSignal = Math.max(0, signalMax);
        const maxNegativeSignal = Math.max(0, -signalMin);
        const uncertaintyBefore = 1 / Math.sqrt(priorInfo);
        const uncertaintyAfter = 1 / Math.sqrt(priorInfo + Math.max(0, expectedInformation));

        metrics[traitId] = {
            signal_min: signalMin,
            signal_max: signalMax,
            max_abs_signal: Math.max(maxPositiveSignal, maxNegativeSignal),
            max_positive_signal: maxPositiveSignal,
            max_negative_signal: maxNegativeSignal,
            expected_information: expectedInformation,
            uncertainty_resolution: Math.max(0, uncertaintyBefore - uncertaintyAfter),
            coverage: expectedInformation > 0 || maxPositiveSignal > 0 || maxNegativeSignal > 0 ? 1 : 0,
        };
    }

    return metrics;
};

const compareMinMax = (value: number, min?: number, max?: number): boolean => {
    if (min !== undefined && value < min) return false;
    if (max !== undefined && value > max) return false;
    return true;
};

const matchesTraitFilter = (metrics: QuestionSearchTraitMetrics, filter: QuestionSearchTraitFilter): boolean => {
    if (filter.signal_min !== undefined && metrics.signal_max < filter.signal_min) return false;
    if (filter.signal_max !== undefined && metrics.signal_min > filter.signal_max) return false;
    if (!compareMinMax(metrics.max_abs_signal, filter.abs_signal_min, filter.abs_signal_max)) return false;
    if (!compareMinMax(metrics.max_positive_signal, filter.positive_signal_min, filter.positive_signal_max)) return false;
    if (!compareMinMax(metrics.max_negative_signal, filter.negative_signal_min, filter.negative_signal_max)) return false;
    if (!compareMinMax(metrics.expected_information, filter.expected_information_min, filter.expected_information_max)) return false;
    if (!compareMinMax(metrics.uncertainty_resolution, filter.uncertainty_resolution_min, filter.uncertainty_resolution_max)) return false;
    return compareMinMax(metrics.coverage, filter.coverage_min, filter.coverage_max);
};

const questionTextByField = (question: Question, field: ReturnType<typeof normalizeKeywordFields>[number]): string[] => {
    if (field === 'prompt') return [question.prompt];
    if (field === 'help_text') return [question.help_text];
    if (field === 'responses') return question.responses.map((response) => response.label);
    if (field === 'response_help_text') return question.responses.map((response) => response.help_text);
    return question.tags;
};

const matchesKeywords = (question: Question, keywords: string[], mode: 'all' | 'any', fields: ReturnType<typeof normalizeKeywordFields>): boolean => {
    if (keywords.length === 0) return true;
    const haystack = fields
        .flatMap((field) => questionTextByField(question, field))
        .join('\n')
        .toLowerCase();
    const matches = keywords.map((keyword) => haystack.includes(keyword));
    return mode === 'all' ? matches.every(Boolean) : matches.some(Boolean);
};

const matchesTags = (question: Question, tags: string[], mode: 'all' | 'any'): boolean => {
    if (tags.length === 0) return true;
    const questionTags = new Set(question.tags.map((tag) => tag.toLowerCase()));
    const matches = tags.map((tag) => questionTags.has(tag));
    return mode === 'all' ? matches.every(Boolean) : matches.some(Boolean);
};

const buildSummaryVectors = (
    fields: QuestionSearchSummaryVector[],
    matchedMetrics: Array<Record<string, QuestionSearchTraitMetrics>>,
    traitOrder: string[]
): QuestionSearchResult['summary_vectors'] => {
    if (fields.length === 0) return undefined;

    const vectors: NonNullable<QuestionSearchResult['summary_vectors']> = {};
    for (const field of fields) {
        vectors[field] = traitOrder.map((traitId) => {
            if (field === 'coverage_count') {
                return matchedMetrics.reduce((sum, metrics) => sum + (metrics[traitId]?.coverage ? 1 : 0), 0);
            }

            const metricFieldByVector: Record<Exclude<QuestionSearchSummaryVector, 'coverage_count'>, keyof QuestionSearchTraitMetrics> = {
                max_abs_signal: 'max_abs_signal',
                max_positive_signal: 'max_positive_signal',
                max_negative_signal: 'max_negative_signal',
                max_expected_information: 'expected_information',
                max_uncertainty_resolution: 'uncertainty_resolution',
            };
            const metricField = metricFieldByVector[field];
            return matchedMetrics.reduce((max, metrics) => Math.max(max, metrics[traitId]?.[metricField] ?? 0), 0);
        });
    }

    return vectors;
};

export const getAllQuestionSearchSummaryVectors = (
    definition: QuizDefinition
): { summary_vectors: NonNullable<QuestionSearchResult['summary_vectors']>; trait_order: string[] } => {
    const traitOrder = getTraitOrder(definition);
    const priorInfo = Math.max(1e-9, definition.scoring_config.prior_info ?? 1);
    const sortedQuestions = definition.questions.slice().sort((left, right) => left.display_order - right.display_order);
    const summary_vectors = buildSummaryVectors(
        [...QUESTION_SEARCH_SUMMARY_VECTORS],
        sortedQuestions.map((question) => getQuestionMetrics(question, traitOrder, priorInfo)),
        traitOrder
    );

    return {
        summary_vectors: summary_vectors ?? {},
        trait_order: traitOrder,
    };
};

const projectQuestion = async (
    question: Question,
    metrics: Record<string, QuestionSearchTraitMetrics>,
    fields: QuestionSearchIncludeField[]
): Promise<QuestionSearchResult['questions'][number]> => {
    const projected: QuestionSearchResult['questions'][number] = {};
    const fieldSet = new Set(fields);

    if (fieldSet.has('id')) projected.id = question.id;
    if (fieldSet.has('display_order')) projected.display_order = question.display_order;
    if (fieldSet.has('prompt')) projected.prompt = question.prompt;
    if (fieldSet.has('help_text')) projected.help_text = question.help_text;
    if (fieldSet.has('responses')) projected.responses = question.responses;
    if (fieldSet.has('tags')) projected.tags = question.tags;
    if (fieldSet.has('active')) projected.active = question.active;
    if (fieldSet.has('adaptive_eligible')) projected.adaptive_eligible = question.adaptive_eligible;
    if (fieldSet.has('trait_metrics')) projected.trait_metrics = metrics;
    if (fieldSet.has('old_question_hash')) projected.old_question_hash = await hashQuestion(question);

    return projected;
};

export const searchQuestions = async (definition: QuizDefinition, input: unknown): Promise<QuestionSearchResult> => {
    const errors: SearchToolIssue[] = [];
    const warnings: SearchToolIssue[] = [];
    const params = normalizeInput(input, warnings, errors);
    const traitOrder = getTraitOrder(definition);
    const traitIds = new Set(traitOrder);

    for (let index = 0; index < params.trait_filters.length; index += 1) {
        const filter = params.trait_filters[index]!;
        if (!traitIds.has(filter.trait_id)) {
            errors.push({
                code: 'UNKNOWN_TRAIT',
                message: `Trait ${filter.trait_id || '(missing)'} was not found.`,
                path: `/trait_filters/${index}/trait_id`,
            });
        }
    }

    if (errors.length > 0) {
        return {
            ok: false,
            errors,
            warnings,
            pagination: {
                total_matches: 0,
                offset: params.offset,
                limit: params.limit,
                returned: 0,
                has_more: false,
                next_offset: null,
            },
            questions: [],
            trait_order: traitOrder,
        };
    }

    const priorInfo = Math.max(1e-9, definition.scoring_config.prior_info ?? 1);
    const sortedQuestions = definition.questions.slice().sort((left, right) => left.display_order - right.display_order);
    const matched: Array<{ metrics: Record<string, QuestionSearchTraitMetrics>; question: Question }> = [];

    for (const question of sortedQuestions) {
        if (params.active !== undefined && question.active !== params.active) continue;
        if (params.adaptive_eligible !== undefined && question.adaptive_eligible !== params.adaptive_eligible) continue;
        if (!matchesKeywords(question, params.keywords, params.keyword_mode, params.keyword_fields)) continue;
        if (!matchesTags(question, params.tags, params.tag_mode)) continue;

        const metrics = getQuestionMetrics(question, traitOrder, priorInfo);
        if (params.trait_filters.length > 0) {
            const filterMatches = params.trait_filters.map((filter) => matchesTraitFilter(metrics[filter.trait_id]!, filter));
            const matches = params.trait_filter_mode === 'all' ? filterMatches.every(Boolean) : filterMatches.some(Boolean);
            if (!matches) continue;
        }

        matched.push({ metrics, question });
    }

    const page = matched.slice(params.offset, params.offset + params.limit);
    const nextOffset = params.offset + page.length;

    return {
        ok: true,
        errors,
        warnings,
        pagination: {
            total_matches: matched.length,
            offset: params.offset,
            limit: params.limit,
            returned: page.length,
            has_more: nextOffset < matched.length,
            next_offset: nextOffset < matched.length ? nextOffset : null,
        },
        questions: await Promise.all(
            page.map((entry) => projectQuestion(entry.question, entry.metrics, params.include_fields))
        ),
        summary_vectors: buildSummaryVectors(
            params.include_summary_vectors,
            matched.map((entry) => entry.metrics),
            traitOrder
        ),
        trait_order: traitOrder,
    };
};
