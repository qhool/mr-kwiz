export type MrKwizMcpToolName = 'get_quiz_context' | 'get_question_context' | 'search_questions' | 'get_edit_capabilities' | 'validate_edit' | 'apply_edit';

type McpNamed = { mcpName: string };

export type CapturedSystemPrompt = {
    capturedAt: string;
    mcpName?: string;
    sessionID: string;
    system: string[];
    tokenHash?: string;
};

export type CapturedToolDefinition = {
    capturedAt: string;
    description: string;
    parameters?: unknown;
    toolID: string;
};

const MRKWIZ_MCP_TOOLS_START = '<mrkwiz_mcp_tools>';
const MRKWIZ_MCP_TOOLS_END = '</mrkwiz_mcp_tools>';

export const mcpToolId = (entry: McpNamed, toolName: MrKwizMcpToolName): string => `${entry.mcpName}_${toolName}`;

export const mcpToolReference = (entry: McpNamed, toolName: MrKwizMcpToolName): string => `functions.${mcpToolId(entry, toolName)}`;

export const buildMcpSystemPrompt = (entry: McpNamed): string => [
    MRKWIZ_MCP_TOOLS_START,
    '## MrKwiz MCP Tools',
    '',
    `This OpenCode session is bound to MrKwiz MCP server \`${entry.mcpName}\`.`,
    '',
    'Use these exact OpenCode tool names for this quiz:',
    `- \`${mcpToolReference(entry, 'get_quiz_context')}\``,
    `- \`${mcpToolReference(entry, 'search_questions')}\``,
    `- \`${mcpToolReference(entry, 'get_question_context')}\``,
    `- \`${mcpToolReference(entry, 'get_edit_capabilities')}\``,
    `- \`${mcpToolReference(entry, 'validate_edit')}\``,
    `- \`${mcpToolReference(entry, 'apply_edit')}\``,
    MRKWIZ_MCP_TOOLS_END,
].join('\n');

export const upsertMcpSystemPrompt = (system: string, entry: McpNamed): string => {
    const section = buildMcpSystemPrompt(entry);
    const start = system.indexOf(MRKWIZ_MCP_TOOLS_START);
    if (start === -1) return system ? `${system.trimEnd()}\n\n${section}` : section;

    const end = system.indexOf(MRKWIZ_MCP_TOOLS_END, start);
    if (end === -1) return system.includes(section) ? system : `${system.trimEnd()}\n\n${section}`;

    const before = system.slice(0, start).trimEnd();
    const after = system.slice(end + MRKWIZ_MCP_TOOLS_END.length).trimStart();
    return [before, section, after].filter(Boolean).join('\n\n');
};

export const injectMcpSystemPrompt = (system: string[], entry: McpNamed): void => {
    if (system.length === 0) {
        system.push(buildMcpSystemPrompt(entry));
        return;
    }
    system[0] = upsertMcpSystemPrompt(system[0], entry);
};

export const captureSystemPrompt = (captures: Map<string, CapturedSystemPrompt>, prompt: CapturedSystemPrompt): CapturedSystemPrompt => {
    const captured = { ...prompt, system: [...prompt.system] };
    captures.set(prompt.sessionID, captured);
    return captured;
};

export const getCapturedSystemPrompt = (captures: Map<string, CapturedSystemPrompt>, sessionID: string): CapturedSystemPrompt | undefined => captures.get(sessionID);

const cloneJsonLike = (value: unknown): unknown => {
    if (value === undefined) return undefined;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return String(value);
    }
};

export const captureToolDefinition = (captures: Map<string, CapturedToolDefinition>, toolDefinition: CapturedToolDefinition): CapturedToolDefinition => {
    const captured = { ...toolDefinition, parameters: cloneJsonLike(toolDefinition.parameters) };
    captures.set(toolDefinition.toolID, captured);
    return captured;
};

export const getCapturedToolDefinitions = (captures: Map<string, CapturedToolDefinition>, options: { includeParameters?: boolean; prefix?: string } = {}) => {
    const prefix = options.prefix?.trim();
    return [...captures.values()]
        .filter((definition) => !prefix || definition.toolID.startsWith(prefix))
        .sort((a, b) => a.toolID.localeCompare(b.toolID))
        .map((definition) => ({
            captured_at: definition.capturedAt,
            description: definition.description,
            ...(options.includeParameters ? { parameters: definition.parameters } : {}),
            tool_id: definition.toolID,
        }));
};
