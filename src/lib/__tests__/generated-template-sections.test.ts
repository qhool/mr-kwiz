import { describe, expect, it } from 'vitest';

import { buildGeneratedSectionTagName, getGeneratedSectionTagInfoByKey } from '../generated-template-sections';

describe('generated template sections', () => {
    it('parses multiple checksum-tagged injected sections', () => {
        const firstSha = 'a'.repeat(64);
        const secondSha = 'b'.repeat(64);
        const template = [
            `{{{${buildGeneratedSectionTagName('schema_reference', firstSha)}}}}`,
            `{{{${buildGeneratedSectionTagName('mcp_tools', secondSha)}}}}`,
        ].join('\n');

        const tags = getGeneratedSectionTagInfoByKey(template, ['schema_reference', 'mcp_tools']);

        expect(tags.schema_reference.sha256).toBe(firstSha);
        expect(tags.mcp_tools.sha256).toBe(secondSha);
        expect(tags.schema_reference.tagName).toBe(`schema_reference_sha256_${firstSha}`);
        expect(tags.mcp_tools.tagName).toBe(`mcp_tools_sha256_${secondSha}`);
    });
});
