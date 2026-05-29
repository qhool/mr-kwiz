import { describe, expect, it } from 'vitest';

import { quizDefinitionSchema, type Archetype, type QuizDefinition } from '../quiz-definition';
import {
    getSelectedArchetypeDisplay,
    selectArchetype,
    type TraitStatistics,
} from '../respondent-quiz';

const buildDefinition = (archetypes: Archetype[]): QuizDefinition =>
    quizDefinitionSchema.parse({
        schema_version: 1,
        definition_version: 1,
        title: 'Archetype selection test quiz',
        description: '',
        question_ordering: 'ordered',
        traits: [
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
        ],
        questions: [],
        scoring_config: {
            prior_info: 1,
        },
        display_config: {
            trait_polarity: 'bidirectional',
            archetypes,
        },
    });

const makeMain = (
    id: string,
    display_order: number,
    overrides: Partial<Archetype> = {}
): Archetype => ({
    id,
    name: id,
    description: `${id} description`,
    is_main: true,
    trait_conditions: [{ trait_id: 'trait-a', score_min: 1 }],
    compatibility_main_archetype_ids: [],
    variants_by_main_archetype_id: {},
    display_order,
    ...overrides,
});

const makeSubtype = (
    id: string,
    display_order: number,
    overrides: Partial<Archetype> = {}
): Archetype => ({
    id,
    name: id,
    description: `${id} description`,
    is_main: false,
    trait_conditions: [{ trait_id: 'trait-a', score_min: 1 }],
    compatibility_main_archetype_ids: [],
    variants_by_main_archetype_id: {},
    display_order,
    ...overrides,
});

const stats = (traitA: Partial<TraitStatistics>, traitB?: Partial<TraitStatistics>): Record<string, TraitStatistics> => ({
    'trait-a': {
        estimate: 0,
        contradiction: 0,
        spread: 0,
        ...traitA,
    },
    'trait-b': {
        estimate: 0,
        contradiction: 0,
        spread: 0,
        ...traitB,
    },
});

describe('selectArchetype', () => {
    it('returns undefined when no main archetype matches', () => {
        const definition = buildDefinition([
            makeMain('main-a', 1, { trait_conditions: [{ trait_id: 'trait-a', score_min: 2 }] }),
            makeSubtype('sub-a', 2),
        ]);

        expect(selectArchetype(definition, stats({ estimate: 1 }))).toBeUndefined();
    });

    it('picks the first matching main archetype by display order', () => {
        const definition = buildDefinition([
            makeMain('main-b', 2),
            makeMain('main-a', 1),
        ]);

        const selected = selectArchetype(definition, stats({ estimate: 3 }));

        expect(selected?.main.id).toBe('main-a');
        expect(selected?.subtype).toBeUndefined();
    });

    it('never treats a subtype as the main archetype', () => {
        const definition = buildDefinition([
            makeSubtype('sub-a', 1, { trait_conditions: [{ trait_id: 'trait-a', score_min: 0 }] }),
            makeMain('main-a', 2, { trait_conditions: [{ trait_id: 'trait-a', score_min: 2 }] }),
        ]);

        expect(selectArchetype(definition, stats({ estimate: 1 }))).toBeUndefined();
    });

    it('treats missing compatibility_mode with the default empty compatibility list as unrestricted', () => {
        const definition = buildDefinition([
            makeMain('main-a', 1),
            makeSubtype('sub-open', 3),
        ]);

        const selected = selectArchetype(definition, stats({ estimate: 2 }));

        expect(selected?.main.id).toBe('main-a');
        expect(selected?.subtype?.id).toBe('sub-open');
    });

    it('enforces allow-list compatibility and then picks the first matching compatible subtype', () => {
        const definition = buildDefinition([
            makeMain('main-a', 1),
            makeMain('main-b', 2, { trait_conditions: [{ trait_id: 'trait-b', score_min: 5 }] }),
            makeSubtype('sub-blocked', 2, {
                compatibility_mode: 'allow-list',
                compatibility_main_archetype_ids: ['main-b'],
            }),
            makeSubtype('sub-allowed', 3, {
                compatibility_mode: 'allow-list',
                compatibility_main_archetype_ids: ['main-a'],
            }),
            makeSubtype('sub-later', 4),
        ]);

        const selected = selectArchetype(definition, stats({ estimate: 2 }));

        expect(selected?.main.id).toBe('main-a');
        expect(selected?.subtype?.id).toBe('sub-allowed');
    });

    it('enforces incompatibility-list compatibility', () => {
        const definition = buildDefinition([
            makeMain('main-a', 1),
            makeMain('main-b', 2, { trait_conditions: [{ trait_id: 'trait-b', score_min: 5 }] }),
            makeSubtype('sub-blocked', 2, {
                compatibility_mode: 'incompatibility-list',
                compatibility_main_archetype_ids: ['main-a'],
            }),
            makeSubtype('sub-open', 3, {
                compatibility_mode: 'incompatibility-list',
                compatibility_main_archetype_ids: ['main-b'],
            }),
        ]);

        const selected = selectArchetype(definition, stats({ estimate: 2 }));

        expect(selected?.main.id).toBe('main-a');
        expect(selected?.subtype?.id).toBe('sub-open');
    });

    it('rejects subtype matches when score or contradiction conditions fail', () => {
        const definition = buildDefinition([
            makeMain('main-a', 1),
            makeSubtype('sub-score', 2, {
                trait_conditions: [{ trait_id: 'trait-a', score_min: 3 }],
            }),
            makeSubtype('sub-contradiction', 3, {
                trait_conditions: [{ trait_id: 'trait-a', contradiction_max: 0.5 }],
            }),
        ]);

        const selected = selectArchetype(
            definition,
            stats({ estimate: 2, contradiction: 1, spread: 1 })
        );

        expect(selected?.main.id).toBe('main-a');
        expect(selected?.subtype).toBeUndefined();
    });
});

describe('getSelectedArchetypeDisplay', () => {
    it('returns undefined for an undefined selection', () => {
        expect(getSelectedArchetypeDisplay()).toBeUndefined();
    });

    it('returns main-only display details when no subtype is selected', () => {
        const definition = buildDefinition([makeMain('main-a', 1)]);
        const selected = selectArchetype(definition, stats({ estimate: 2 }));

        expect(getSelectedArchetypeDisplay(selected)).toEqual({
            mainName: 'main-a',
            mainDescription: 'main-a description',
            subtypeName: undefined,
            subtypeDescription: undefined,
        });
    });

    it('falls back to the subtype name and description when no variant exists for the selected main', () => {
        const definition = buildDefinition([
            makeMain('main-a', 1),
            makeSubtype('sub-a', 2, {
                compatibility_mode: 'allow-list',
                compatibility_main_archetype_ids: ['main-a'],
            }),
        ]);
        const selected = selectArchetype(definition, stats({ estimate: 2 }));

        expect(getSelectedArchetypeDisplay(selected)).toEqual({
            mainName: 'main-a',
            mainDescription: 'main-a description',
            subtypeName: 'sub-a',
            subtypeDescription: 'sub-a description',
        });
    });

    it('uses the variant keyed by the selected main archetype', () => {
        const definition = buildDefinition([
            makeMain('main-b', 2, { trait_conditions: [{ trait_id: 'trait-b', score_min: 2 }] }),
            makeMain('main-a', 1, { trait_conditions: [{ trait_id: 'trait-a', score_min: 2 }] }),
            makeSubtype('sub-a', 3, {
                trait_conditions: [{ trait_id: 'trait-a', score_min: 0 }],
                compatibility_mode: 'allow-list',
                compatibility_main_archetype_ids: ['main-a', 'main-b'],
                variants_by_main_archetype_id: {
                    'main-a': {
                        name: 'Variant A',
                        description: 'Variant for main A',
                    },
                    'main-b': {
                        name: 'Variant B',
                        description: 'Variant for main B',
                    },
                },
            }),
        ]);

        const selectedMainA = selectArchetype(definition, stats({ estimate: 2 }, { estimate: 0 }));
        const selectedMainB = selectArchetype(definition, stats({ estimate: 0 }, { estimate: 3 }));

        expect(getSelectedArchetypeDisplay(selectedMainA)).toEqual({
            mainName: 'main-a',
            mainDescription: 'main-a description',
            subtypeName: 'Variant A',
            subtypeDescription: 'Variant for main A',
        });
        expect(getSelectedArchetypeDisplay(selectedMainB)).toEqual({
            mainName: 'main-b',
            mainDescription: 'main-b description',
            subtypeName: 'Variant B',
            subtypeDescription: 'Variant for main B',
        });
    });
});