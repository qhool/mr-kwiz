import { z } from 'zod';

import * as quizSchemas from './quiz-definition';

type AnySchema = z.ZodType;

type ExportedSchemaEntry = {
    exportName: string;
    schema: AnySchema;
};

type DocsMeta = {
    description?: string;
    docs?: {
        notes?: string[];
        crossFieldRules?: string[];
    };
};

const ROOT_EXPORT_NAMES = ['quizDefinitionSchema', 'quizEditPatchSchema'] as const;

const exportedSchemas: ExportedSchemaEntry[] = Object.entries(quizSchemas)
    .filter(([exportName, schema]) => exportName.endsWith('Schema') && schema instanceof z.ZodType)
    .map(([exportName, schema]) => ({
        exportName,
        schema: schema as AnySchema,
    }));

const exportedSchemaNameByIdentity = new Map<AnySchema, string>(
    exportedSchemas.map(({ exportName, schema }) => [schema, exportName])
);

const renderableExportEntries = exportedSchemas.filter(({ schema }) => isRenderableSchema(schema));
const renderableSchemas = new Set(renderableExportEntries.map(({ schema }) => schema));

function isRenderableSchema(schema: AnySchema): boolean {
    const unwrapped = unwrapSchema(schema);
    return unwrapped instanceof z.ZodObject || unwrapped instanceof z.ZodUnion;
}

function unwrapSchema(schema: AnySchema): AnySchema {
    let current = schema;

    while (
        current instanceof z.ZodOptional ||
        current instanceof z.ZodDefault ||
        current instanceof z.ZodNullable
    ) {
        current = current.unwrap();
    }

    return current;
}

function getSchemaMeta(schema: AnySchema): DocsMeta {
    return (schema.meta?.() ?? {}) as DocsMeta;
}

function toSectionName(exportName: string): string {
    const withoutSuffix = exportName.replace(/Schema$/, '');
    return withoutSuffix.charAt(0).toUpperCase() + withoutSuffix.slice(1);
}

function getImmediateChildren(schema: AnySchema): AnySchema[] {
    const unwrapped = unwrapSchema(schema);

    if (unwrapped instanceof z.ZodObject) {
        return Object.values(unwrapped.shape);
    }

    if (unwrapped instanceof z.ZodArray) {
        return [unwrapped.element];
    }

    if (unwrapped instanceof z.ZodUnion) {
        return unwrapped.options;
    }

    return [];
}

function collectReachableDepths(): Map<AnySchema, number> {
    const depths = new Map<AnySchema, number>();
    const queue: Array<{ depth: number; schema: AnySchema }> = ROOT_EXPORT_NAMES.map((exportName) => ({
        depth: 0,
        schema: (quizSchemas as Record<string, AnySchema>)[exportName],
    }));
    const seenAtDepth = new Map<AnySchema, number>();

    while (queue.length > 0) {
        const current = queue.shift();
        if (!current) {
            continue;
        }

        const schema = unwrapSchema(current.schema);
        const previousDepth = seenAtDepth.get(schema);
        if (previousDepth !== undefined && previousDepth <= current.depth) {
            continue;
        }

        seenAtDepth.set(schema, current.depth);

        if (renderableSchemas.has(schema)) {
            const recordedDepth = depths.get(schema);
            if (recordedDepth === undefined || current.depth < recordedDepth) {
                depths.set(schema, current.depth);
            }
        }

        for (const child of getImmediateChildren(schema)) {
            queue.push({ depth: current.depth + 1, schema: child });
        }
    }

    return depths;
}

function deriveFieldInfo(schema: AnySchema): { required: boolean; unwrapped: AnySchema; constraints: string[] } {
    const constraints: string[] = [];
    let current = schema;
    let required = true;

    while (true) {
        if (current instanceof z.ZodOptional) {
            required = false;
            current = current.unwrap();
            continue;
        }

        if (current instanceof z.ZodDefault) {
            required = false;
            constraints.push('default');
            current = current.unwrap();
            continue;
        }

        if (current instanceof z.ZodNullable) {
            current = current.unwrap();
            continue;
        }

        break;
    }

    constraints.push(...extractChecks(current));

    return {
        required,
        unwrapped: current,
        constraints,
    };
}

function extractChecks(schema: AnySchema): string[] {
    const unwrapped = unwrapSchema(schema);
    const constraints: string[] = [];
    const checks = ((unwrapped as { def?: { checks?: Array<{ def?: Record<string, unknown>; _zod?: { def?: Record<string, unknown> } }> } }).def?.checks ?? []);

    for (const check of checks) {
        const checkDef = check.def ?? check._zod?.def;
        if (!checkDef) {
            continue;
        }

        switch (checkDef.check) {
            case 'min_length':
                constraints.push(`min length ${String(checkDef.minimum)}`);
                break;
            case 'max_length':
                constraints.push(`max length ${String(checkDef.maximum)}`);
                break;
            case 'greater_than':
                constraints.push(`${checkDef.inclusive ? '>=' : '>'} ${String(checkDef.value)}`);
                break;
            case 'less_than':
                constraints.push(`${checkDef.inclusive ? '<=' : '<'} ${String(checkDef.value)}`);
                break;
            case 'number_format':
                if (checkDef.format === 'safeint') {
                    constraints.push('integer');
                }
                break;
            default:
                break;
        }
    }

    return constraints;
}

function renderType(schema: AnySchema): string {
    const unwrapped = unwrapSchema(schema);
    const exportName = exportedSchemaNameByIdentity.get(unwrapped);

    if (exportName) {
        return toSectionName(exportName);
    }

    if (unwrapped instanceof z.ZodString) {
        return 'string';
    }

    if (unwrapped instanceof z.ZodNumber) {
        return 'number';
    }

    if (unwrapped instanceof z.ZodBoolean) {
        return 'boolean';
    }

    if (unwrapped instanceof z.ZodArray) {
        return `${renderType(unwrapped.element)}[]`;
    }

    if (unwrapped instanceof z.ZodLiteral) {
        return Array.from(unwrapped.values)
            .map((value) => JSON.stringify(value))
            .join(' | ');
    }

    if (unwrapped instanceof z.ZodUnion) {
        return unwrapped.options.map((option) => renderType(option)).join(' | ');
    }

    if (unwrapped instanceof z.ZodObject) {
        return 'object';
    }

    return unwrapped.constructor.name;
}

function renderNotes(schema: AnySchema): string {
    const meta = getSchemaMeta(schema);
    const notes = [meta.description, ...(meta.docs?.notes ?? [])].filter(Boolean);
    return notes.join(' ');
}

function renderTable(headers: string[], rows: string[][]): string[] {
    const widths = headers.map((header, index) => {
        const rowWidth = Math.max(...rows.map((row) => row[index]?.length ?? 0), 0);
        return Math.max(header.length, rowWidth);
    });

    const formatRow = (cells: string[]) => {
        return `| ${cells
            .map((cell, index) => cell.padEnd(widths[index], ' '))
            .join(' | ')} |`;
    };

    const separator = `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`;

    return [formatRow(headers), separator, ...rows.map((row) => formatRow(row))];
}

function renderObjectSection(sectionName: string, schema: z.ZodObject): string[] {
    const lines = [`## ${sectionName}`];
    const meta = getSchemaMeta(schema);

    if (meta.description) {
        lines.push('', meta.description);
    }

    const rows: string[][] = [];

    const fieldNames = Object.keys(schema.shape).sort((left, right) => left.localeCompare(right));
    for (const fieldName of fieldNames) {
        const fieldSchema = schema.shape[fieldName];
        const fieldInfo = deriveFieldInfo(fieldSchema);
        const fieldNotes = renderNotes(fieldSchema);

        rows.push([
            fieldName,
            renderType(fieldInfo.unwrapped),
            fieldInfo.required ? 'yes' : 'no',
            fieldInfo.constraints.join(', '),
            fieldNotes,
        ]);
    }

    lines.push('', ...renderTable(['field', 'type', 'required', 'constraints', 'notes'], rows));

    if ((meta.docs?.notes ?? []).length > 0) {
        lines.push('', 'Notes:');
        for (const note of meta.docs?.notes ?? []) {
            lines.push(`- ${note}`);
        }
    }

    return lines;
}

function renderUnionSection(sectionName: string, schema: z.ZodUnion): string[] {
    const lines = [`## ${sectionName}`];
    const meta = getSchemaMeta(schema);

    if (meta.description) {
        lines.push('', meta.description);
    }

    const rows = schema.options
        .map((option) => unwrapSchema(option))
        .filter((option): option is z.ZodObject => option instanceof z.ZodObject)
        .map((option) => {
            const opSchema = option.shape.op;
            const opValue = opSchema instanceof z.ZodLiteral ? Array.from(opSchema.values)[0] : '(unknown)';
            const exportName = exportedSchemaNameByIdentity.get(option);

            return {
                op: JSON.stringify(opValue),
                target: exportName ? toSectionName(exportName) : 'object',
                notes: renderNotes(option),
            };
        })
        .sort((left, right) => left.op.localeCompare(right.op));

    lines.push(
        '',
        ...renderTable(
            ['op', 'schema', 'notes'],
            rows.map((row) => [row.op, row.target, row.notes])
        )
    );

    return lines;
}

function renderCrossFieldRules(sections: Array<{ sectionName: string; schema: AnySchema }>): string[] {
    const rules = sections.flatMap(({ sectionName, schema }) => {
        const meta = getSchemaMeta(schema);
        return (meta.docs?.crossFieldRules ?? []).map((rule) => `${sectionName}: ${rule}`);
    });

    if (rules.length === 0) {
        return [];
    }

    return ['## CrossFieldValidationRules', '', ...rules.sort((left, right) => left.localeCompare(right)).map((rule) => `- ${rule}`)];
}

export function generateSchemaMarkdown(): string {
    const depths = collectReachableDepths();
    const sections = renderableExportEntries
        .filter(({ schema }) => depths.has(schema))
        .sort((left, right) => {
            const depthDelta = (depths.get(left.schema) ?? Number.MAX_SAFE_INTEGER) - (depths.get(right.schema) ?? Number.MAX_SAFE_INTEGER);
            if (depthDelta !== 0) {
                return depthDelta;
            }

            return toSectionName(left.exportName).localeCompare(toSectionName(right.exportName));
        })
        .map(({ exportName, schema }) => ({
            sectionName: toSectionName(exportName),
            schema: unwrapSchema(schema),
        }));

    const lines = [
        '# Auto-Generated Quiz Schema Reference',
        '',
        'Generated from the application Zod schemas and inline schema metadata.',
    ];

    for (const section of sections) {
        lines.push('');

        if (section.schema instanceof z.ZodObject) {
            lines.push(...renderObjectSection(section.sectionName, section.schema));
            continue;
        }

        if (section.schema instanceof z.ZodUnion) {
            lines.push(...renderUnionSection(section.sectionName, section.schema));
        }
    }

    const crossFieldRules = renderCrossFieldRules(sections);
    if (crossFieldRules.length > 0) {
        lines.push('', ...crossFieldRules);
    }

    return `${lines.join('\n')}\n`;
}

async function sha256Hex(input: string): Promise<string> {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', bytes);

    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

export async function generateSchemaDocsArtifact(): Promise<{ markdown: string; sha256: string }> {
    const markdown = generateSchemaMarkdown();

    return {
        markdown,
        sha256: await sha256Hex(markdown),
    };
}