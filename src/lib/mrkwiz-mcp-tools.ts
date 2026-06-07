import { sha256Hex } from './generated-template-sections';

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
        `OpenCode exposes these dynamic MCP tools under the \`${MRKWIZ_MCP_TOOL_NAMESPACE}\` namespace. Use names such as \`${MRKWIZ_MCP_TOOL_NAMESPACE}.get_quiz_context\`, \`${MRKWIZ_MCP_TOOL_NAMESPACE}.validate_edit\`, and \`${MRKWIZ_MCP_TOOL_NAMESPACE}.apply_edit\`.`,
        '',
        'These tools may not appear in OpenCode static helper/tool lists because they are discovered from the active MCP server at runtime.',
    ];

    for (const tool of MRKWIZ_MCP_TOOLS) {
        lines.push('', `## ${MRKWIZ_MCP_TOOL_NAMESPACE}.${tool.name}`, '', tool.description, '', 'Input schema:', '', '```json', renderSchema(tool.inputSchema), '```');
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
