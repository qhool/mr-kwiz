import { sha256Hex } from './generated-template-sections';
import { QUESTION_SEARCH_SUMMARY_VECTORS } from './question-search';

export const MRKWIZ_MCP_TOOL_NAMESPACE = 'mrkwiz';

export type MrKwizMcpToolDefinition = {
    description: string;
    inputSchema: Record<string, unknown>;
    name: string;
};

export const MRKWIZ_MCP_TOOLS: readonly MrKwizMcpToolDefinition[] = [
    {
        name: 'get_quiz_context',
        description: 'Get the current MrKwiz quiz context and editing reminders.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'get_question_context',
        description: 'Get a full question, trait order, and old_question_hash for safe editing.',
        inputSchema: { type: 'object', properties: { question_id: { type: 'string' } }, required: ['question_id'] },
    },
    {
        name: 'search_questions',
        description: 'Search questions by keywords, tags, trait metric ranges, activity flags, and selectable return fields.',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                keywords: { type: 'array', items: { type: 'string' } },
                keyword_mode: { type: 'string', enum: ['all', 'any'] },
                keyword_fields: {
                    type: 'array',
                    default: ['prompt', 'help_text', 'tags'],
                    description: 'Fields searched by keywords. Defaults to prompt, help_text, and tags; include responses explicitly to search response labels.',
                    items: { type: 'string', enum: ['prompt', 'help_text', 'responses', 'response_help_text', 'tags'] },
                },
                tags: { type: 'array', items: { type: 'string' } },
                tag_mode: { type: 'string', enum: ['all', 'any'] },
                active: { type: 'boolean' },
                adaptive_eligible: { type: 'boolean' },
                trait_filters: {
                    type: 'array',
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            trait_id: { type: 'string' },
                            signal_min: { type: 'number' },
                            signal_max: { type: 'number' },
                            abs_signal_min: { type: 'number' },
                            abs_signal_max: { type: 'number' },
                            positive_signal_min: { type: 'number' },
                            positive_signal_max: { type: 'number' },
                            negative_signal_min: { type: 'number' },
                            negative_signal_max: { type: 'number' },
                            expected_information_min: { type: 'number' },
                            expected_information_max: { type: 'number' },
                            uncertainty_resolution_min: { type: 'number' },
                            uncertainty_resolution_max: { type: 'number' },
                            coverage_min: { type: 'number' },
                            coverage_max: { type: 'number' },
                        },
                        required: ['trait_id'],
                    },
                },
                trait_filter_mode: { type: 'string', enum: ['all', 'any'] },
                include_fields: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: [
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
                        ],
                    },
                },
                include_summary_vectors: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: QUESTION_SEARCH_SUMMARY_VECTORS,
                    },
                },
                offset: { type: 'number', minimum: 0 },
                limit: { type: 'number', minimum: 1, maximum: 100 },
            },
        },
    },
    {
        name: 'get_edit_capabilities',
        description: 'List supported edit operations for the current quiz state.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'validate_edit',
        description: 'Validate a QuizEditPatch without saving it.',
        inputSchema: { type: 'object', properties: { patch: { type: 'object' } }, required: ['patch'] },
    },
    {
        name: 'apply_edit',
        description: 'Apply a validated QuizEditPatch to the quiz.',
        inputSchema: { type: 'object', properties: { patch: { type: 'object' } }, required: ['patch'] },
    },
    {
        name: 'set_callback_url',
        description: 'Register the local OpenCode bridge callback URL for this token.',
        inputSchema: { type: 'object', properties: { callback_url: { type: 'string' }, callback_origin: { type: 'string' } }, required: ['callback_url'] },
    },
    {
        name: 'clear_callback_url',
        description: 'Clear the registered local OpenCode bridge callback URL.',
        inputSchema: { type: 'object', properties: {} },
    },
] as const;

export const getMrKwizMcpToolsList = () => ({
    tools: MRKWIZ_MCP_TOOLS.map((tool) => ({ ...tool })),
});

const renderSchema = (schema: Record<string, unknown>): string => JSON.stringify(schema, null, 2);

export const renderMcpToolsMarkdown = (): string => {
    const lines = [
        '# Auto-Generated MrKwiz MCP Tools Reference',
        '',
        'Generated from the hosted MrKwiz MCP tool definitions used by the server.',
        '',
        `OpenCode exposes these MCP tools with fully qualified tool names. If the server is named \`${MRKWIZ_MCP_TOOL_NAMESPACE}\`, use names such as \`functions.${MRKWIZ_MCP_TOOL_NAMESPACE}_get_quiz_context\`, \`functions.${MRKWIZ_MCP_TOOL_NAMESPACE}_validate_edit\`, and \`functions.${MRKWIZ_MCP_TOOL_NAMESPACE}_apply_edit\`.`,
        '',
        'In MrKwiz quiz workspaces, token-specific MCP servers are statically configured in the generated OpenCode workspace config and discovered when that workspace starts.',
    ];

    for (const tool of MRKWIZ_MCP_TOOLS) {
        lines.push('', `## functions.${MRKWIZ_MCP_TOOL_NAMESPACE}_${tool.name}`, '', tool.description, '', 'Input schema:', '', '```json', renderSchema(tool.inputSchema), '```');
    }

    return `${lines.join('\n')}\n`;
};

export const generateMcpToolsDocsArtifact = async (): Promise<{ markdown: string; sha256: string }> => {
    const markdown = renderMcpToolsMarkdown();
    return {
        markdown,
        sha256: await sha256Hex(markdown),
    };
};
