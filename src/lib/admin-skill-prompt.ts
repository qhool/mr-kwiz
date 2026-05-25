import Mustache from 'mustache';

import skillTemplate from '../../docs/skill-template.md.mustache?raw';
import schemaReference from '../../docs/quiz-schema-reference.md?raw';

import type { QuizDefinition } from './quiz-definition';

type AdminPromptMetadata = {
    current_definition_version: number;
    description: string;
    id: string;
    title: string;
};

type AdminSkillPromptContext = {
    base_definition_version: number;
    determination_summary: string;
    has_questions: boolean;
    id_policy: string;
    patch_context: string;
    question_count: number;
    question_index: string;
    schema_reference: string;
    target_context: string;
    trait_count: number;
    trait_order: string;
};

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
    const lines = ['## Trait Order', ''];

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

const buildPromptContext = (
    definition: QuizDefinition,
    metadata: AdminPromptMetadata
): AdminSkillPromptContext => {
    return {
        base_definition_version: metadata.current_definition_version,
        determination_summary: NOT_PROVIDED,
        has_questions: definition.questions.length > 0,
        id_policy: NOT_PROVIDED,
        patch_context: NOT_PROVIDED,
        question_count: definition.questions.length,
        question_index: renderQuestionIndex(definition),
        schema_reference: schemaReference.trim(),
        target_context: '',
        trait_count: definition.traits.length,
        trait_order: renderTraitOrder(definition),
    };
};

export const renderAdminSkillPrompt = (
    definition: QuizDefinition,
    metadata: AdminPromptMetadata
): string => {
    return Mustache.render(skillTemplate, buildPromptContext(definition, metadata)).trim();
};