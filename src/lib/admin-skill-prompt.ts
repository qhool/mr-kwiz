import Mustache from 'mustache';

import skillTemplate from '../../docs/skill-template.md.mustache?raw';

import { generateSchemaDocsArtifact } from './generated-schema-reference';
import type { AdaptiveSelectionConfig, QuizDefinition } from './quiz-definition';
import { getSchemaReferenceTagInfo } from './schema-reference-template';

type AdminPromptMetadata = {
    current_definition_version: number;
    description: string;
    id: string;
    title: string;
};

type AdminSkillPromptContext = {
    adaptive_selection_section: string;
    base_definition_version: number;
    determination_summary: string;
    has_adaptive_selection: boolean;
    has_questions: boolean;
    id_policy: string;
    patch_context: string;
    question_count: number;
    question_index: string;
    question_ordering: string;
    theme_colors: string;
    target_context: string;
    trait_count: number;
    trait_order: string;
} & Record<string, string | boolean | number>;
const schemaReferenceTag = getSchemaReferenceTagInfo(skillTemplate);

const NOT_PROVIDED = 'NOT PROVIDED';

const escapeCell = (value: string): string => value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

const renderTable = (headers: string[], rows: string[][]): string => {
    const widths = headers.map((header, index) => {
        const rowWidth = Math.max(...rows.map((row) => row[index]?.length ?? 0), 0);
        return Math.max(header.length, rowWidth);
    });

    const renderRow = (cells: string[]) =>
        `| ${cells.map((cell, index) => cell.padEnd(widths[index], ' ')).join(' | ')} |`;

    return [
        renderRow(headers),
        `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`,
        ...rows.map((row) => renderRow(row)),
    ].join('\n');
};

const renderTraitOrder = (definition: QuizDefinition): string => {
    const lines = ['## Trait Order and Polarity', ''];
    
    const polarity = definition.display_config.trait_polarity ?? 'bidirectional';
    lines.push(`All traits are configured as: **${polarity}** traits.`);
    lines.push('');
    
    if (polarity === 'bidirectional') {
        lines.push('Participants will see symmetric scales centered around a midpoint, with the low label on one end and high label on the other. Results will show positive or negative values relative to the center.');
    } else {
        lines.push('Participants will see unidirectional scales running from 0 to max. Results will only show values from 0 upward.');
    }
    lines.push('');

    if (definition.traits.length === 0) {
        lines.push('No traits are defined yet.');
        return lines.join('\n');
    }

    lines.push(
        renderTable(
            ['position', 'trait_id', 'label', 'low_label', 'high_label'],
            definition.traits.map((trait, index) => [
                String(index + 1),
                escapeCell(trait.id),
                escapeCell(trait.label),
                escapeCell(trait.low_label),
                escapeCell(trait.high_label),
            ])
        )
    );

    return lines.join('\n');
};

const summarizePrompt = (prompt: string): string => {
    const collapsed = prompt.replace(/\s+/g, ' ').trim();
    if (collapsed.length <= 80) {
        return collapsed;
    }

    return `${collapsed.slice(0, 77)}...`;
};

const renderAdaptiveSelectionSection = (cfg: AdaptiveSelectionConfig, traitCount: number): string => {
    const lines = ['## Adaptive Selection Configuration', ''];

    lines.push(`- min_questions: ${cfg.min_questions}`);
    lines.push(`- max_questions: ${cfg.max_questions}`);
    lines.push(`- candidate_pool_size: ${cfg.candidate_pool_size}`);
    lines.push(`- candidate_count: ${cfg.candidate_count}`);
    lines.push(`- need_power: ${cfg.need_power}`);
    lines.push(`- uncertainty_weight: ${cfg.uncertainty_weight}`);
    lines.push(`- contradiction_followup_weight: ${cfg.contradiction_followup_weight}`);
    lines.push(`- axis_purity_min: ${cfg.axis_purity_min}`);
    lines.push(`- off_axis_penalty: ${cfg.off_axis_penalty}`);
    lines.push(`- recent_window: ${cfg.recent_window}`);
    lines.push(`- recent_redundancy_penalty: ${cfg.recent_redundancy_penalty}`);
    lines.push(`- skipped_penalty: ${cfg.skipped_penalty}`);
    lines.push(`- batch_diversity_penalty: ${cfg.batch_diversity_penalty}`);
    lines.push(`- min_goodness_to_ask: ${cfg.min_goodness_to_ask}`);
    lines.push('');

    if (cfg.target_info.length === traitCount) {
        lines.push(
            renderTable(
                ['position', 'target_info', 'trait_priority', 'contradiction_target'],
                cfg.target_info.map((val, i) => [
                    String(i + 1),
                    String(val),
                    String(cfg.trait_priority[i] ?? ''),
                    String(cfg.contradiction_target[i] ?? ''),
                ])
            )
        );
    } else {
        lines.push('_Vector lengths do not match trait count — update adaptive_selection after finalizing traits._');
    }

    return lines.join('\n');
};

const renderQuestionIndex = (definition: QuizDefinition): string => {
    const lines = ['## Question Index', ''];

    if (definition.questions.length === 0) {
        lines.push(NOT_PROVIDED);
        return lines.join('\n');
    }

    lines.push(
        renderTable(
            ['position', 'question_id', 'prompt_summary', 'responses'],
            definition.questions.map((question, index) => [
                String(index + 1),
                escapeCell(question.id),
                escapeCell(summarizePrompt(question.prompt)),
                String(question.responses.length),
            ])
        )
    );

    return lines.join('\n');
};

const renderThemeColors = (definition: QuizDefinition): string => {
    const lines = ['## Theme Colors', ''];
    const themeColors = definition.display_config.theme_colors;

    if (!themeColors || Object.keys(themeColors).length === 0) {
        lines.push('No custom theme colors are configured.');
        return lines.join('\n');
    }

    lines.push(
        renderTable(
            ['token', 'hex'],
            Object.entries(themeColors)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([token, hex]) => [escapeCell(token), escapeCell(hex)])
        )
    );

    return lines.join('\n');
};

const buildPromptContext = (
    definition: QuizDefinition,
    metadata: AdminPromptMetadata,
    schemaReferenceMarkdown: string
): AdminSkillPromptContext => {
    const adaptiveCfg = definition.scoring_config.adaptive_selection;
    return {
        adaptive_selection_section: adaptiveCfg
            ? renderAdaptiveSelectionSection(adaptiveCfg, definition.traits.length)
            : '',
        base_definition_version: metadata.current_definition_version,
        determination_summary: NOT_PROVIDED,
        has_adaptive_selection: !!adaptiveCfg,
        has_questions: definition.questions.length > 0,
        id_policy: NOT_PROVIDED,
        patch_context: NOT_PROVIDED,
        question_count: definition.questions.length,
        question_index: renderQuestionIndex(definition),
        question_ordering: definition.question_ordering ?? 'ordered',
        theme_colors: renderThemeColors(definition),
        target_context: '',
        trait_count: definition.traits.length,
        trait_order: renderTraitOrder(definition),
        [schemaReferenceTag.tagName]: schemaReferenceMarkdown.trim(),
    };
};

export const renderAdminSkillPrompt = (
    definition: QuizDefinition,
    metadata: AdminPromptMetadata
): Promise<string> => {
    return renderAdminSkillPromptAsync(definition, metadata);
};

export const renderAdminSkillPromptAsync = async (
    definition: QuizDefinition,
    metadata: AdminPromptMetadata
): Promise<string> => {
    const artifact = await generateSchemaDocsArtifact();

    if (artifact.sha256 !== schemaReferenceTag.sha256) {
        throw new Error(
            `Schema reference checksum mismatch: template expects ${schemaReferenceTag.sha256}, generated ${artifact.sha256}.`
        );
    }

    return Mustache.render(skillTemplate, buildPromptContext(definition, metadata, artifact.markdown)).trim();
};