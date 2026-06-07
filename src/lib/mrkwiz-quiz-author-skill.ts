import Mustache from 'mustache';

import skillTemplate from '../../docs/mrkwiz-quiz-author.SKILL.md.mustache?raw';

import { generateSchemaDocsArtifact } from './generated-schema-reference';
import { getGeneratedSectionTagInfoByKey } from './generated-template-sections';
import { generateMcpToolsDocsArtifact } from './mrkwiz-mcp-tools';

const SECTION_KEYS = ['mcp_tools', 'schema_reference'] as const;

export const renderMrKwizQuizAuthorSkill = async (): Promise<string> => {
    const tags = getGeneratedSectionTagInfoByKey(skillTemplate, SECTION_KEYS);
    const artifacts = {
        mcp_tools: await generateMcpToolsDocsArtifact(),
        schema_reference: await generateSchemaDocsArtifact(),
    };

    const context: Record<string, string> = {};
    for (const sectionKey of SECTION_KEYS) {
        const tag = tags[sectionKey];
        const artifact = artifacts[sectionKey];

        if (artifact.sha256 !== tag.sha256) {
            throw new Error(
                `${sectionKey} checksum mismatch: template expects ${tag.sha256}, generated ${artifact.sha256}.`
            );
        }

        context[tag.tagName] = artifact.markdown.trim();
    }

    return Mustache.render(skillTemplate, context).trim();
};
