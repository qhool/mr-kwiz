import { describe, expect, it } from 'vitest';

import { buildMcpSystemPrompt, captureSystemPrompt, captureToolDefinition, getCapturedSystemPrompt, getCapturedToolDefinitions, injectMcpSystemPrompt, mcpToolId, mcpToolReference, upsertMcpSystemPrompt } from '../../../packages/opencode-plugin/src/prompt';

const entry = { mcpName: 'mrkwiz_abc123def456' };

describe('MrKwiz OpenCode MCP system prompt', () => {
    it('uses OpenCode underscore MCP tool IDs', () => {
        expect(mcpToolId(entry, 'get_quiz_context')).toBe('mrkwiz_abc123def456_get_quiz_context');
        expect(mcpToolReference(entry, 'get_quiz_context')).toBe('functions.mrkwiz_abc123def456_get_quiz_context');
        expect(buildMcpSystemPrompt(entry)).toContain('`functions.mrkwiz_abc123def456_apply_edit`');
        expect(buildMcpSystemPrompt(entry)).not.toContain('mrkwiz_abc123def456.apply_edit');
    });

    it('appends the MCP tools section idempotently to the main system string', () => {
        const once = upsertMcpSystemPrompt('core system prompt', entry);
        const twice = upsertMcpSystemPrompt(once, entry);

        expect(twice).toBe(once);
        expect(once).toContain('core system prompt');
        expect(once).toContain('## MrKwiz MCP Tools');
    });

    it('mutates the first system entry instead of adding another entry', () => {
        const system = ['core system prompt'];

        injectMcpSystemPrompt(system, entry);

        expect(system).toHaveLength(1);
        expect(system[0]).toContain('core system prompt');
        expect(system[0]).toContain('functions.mrkwiz_abc123def456_get_quiz_context');
    });

    it('captures system prompt snapshots by session id', () => {
        const captures = new Map();
        const system = ['core system prompt'];

        const captured = captureSystemPrompt(captures, {
            capturedAt: '2026-06-13T00:00:00.000Z',
            mcpName: entry.mcpName,
            sessionID: 'ses_123',
            system,
            tokenHash: 'token_hash',
        });
        system.push('later mutation');

        expect(getCapturedSystemPrompt(captures, 'ses_123')).toEqual(captured);
        expect(captured.system).toEqual(['core system prompt']);
        expect(getCapturedSystemPrompt(captures, 'missing')).toBeUndefined();
    });

    it('captures and filters tool definitions by prefix', () => {
        const captures = new Map();
        captureToolDefinition(captures, {
            capturedAt: '2026-06-13T00:00:00.000Z',
            description: 'MCP context tool',
            parameters: { type: 'object', properties: {} },
            toolID: 'mrkwiz_abc123def456_get_quiz_context',
        });
        captureToolDefinition(captures, {
            capturedAt: '2026-06-13T00:00:01.000Z',
            description: 'Read file',
            parameters: { type: 'object', properties: { filePath: { type: 'string' } } },
            toolID: 'Read',
        });

        expect(getCapturedToolDefinitions(captures, { prefix: 'mrkwiz_' })).toEqual([
            {
                captured_at: '2026-06-13T00:00:00.000Z',
                description: 'MCP context tool',
                tool_id: 'mrkwiz_abc123def456_get_quiz_context',
            },
        ]);
        expect(getCapturedToolDefinitions(captures, { includeParameters: true, prefix: 'Read' })[0]).toMatchObject({
            parameters: { type: 'object', properties: { filePath: { type: 'string' } } },
            tool_id: 'Read',
        });
    });
});
