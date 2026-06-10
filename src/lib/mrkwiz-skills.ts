import Mustache from 'mustache';

import setupTemplate from '../../docs/mrkwiz-opencode-setup.SKILL.md.mustache?raw';
import designTemplate from '../../docs/mrkwiz-quiz-design.SKILL.md.mustache?raw';
import editTemplate from '../../docs/mrkwiz-quiz-edit.SKILL.md.mustache?raw';

import { generateSchemaDocsArtifact } from './generated-schema-reference';
import { getGeneratedSectionTagInfoByKey } from './generated-template-sections';
import { generateMcpToolsDocsArtifact } from './mrkwiz-mcp-tools';

type SectionKey = 'mcp_tools' | 'schema_reference';

export const MRKWIZ_SKILL_NAMES = [
    'mrkwiz-opencode-setup',
    'mrkwiz-quiz-design',
    'mrkwiz-quiz-edit',
] as const;

export type MrKwizSkillName = (typeof MRKWIZ_SKILL_NAMES)[number];

const SKILL_TEMPLATES: Record<MrKwizSkillName, { sectionKeys: readonly SectionKey[]; template: string }> = {
    'mrkwiz-opencode-setup': { sectionKeys: ['mcp_tools'], template: setupTemplate },
    'mrkwiz-quiz-design': { sectionKeys: [], template: designTemplate },
    'mrkwiz-quiz-edit': { sectionKeys: ['mcp_tools', 'schema_reference'], template: editTemplate },
};

const isMrKwizSkillName = (value: string): value is MrKwizSkillName => {
    return (MRKWIZ_SKILL_NAMES as readonly string[]).includes(value);
};

const getArtifacts = async () => ({
    mcp_tools: await generateMcpToolsDocsArtifact(),
    schema_reference: await generateSchemaDocsArtifact(),
});

export const renderMrKwizSkill = async (name: string): Promise<string | null> => {
    if (!isMrKwizSkillName(name)) return null;

    const { sectionKeys, template } = SKILL_TEMPLATES[name];
    if (sectionKeys.length === 0) return Mustache.render(template, {}).trim();

    const tags = getGeneratedSectionTagInfoByKey(template, sectionKeys);
    const artifacts = await getArtifacts();

    const context: Record<string, string> = {};
    for (const sectionKey of sectionKeys) {
        const tag = tags[sectionKey];
        const artifact = artifacts[sectionKey];

        if (artifact.sha256 !== tag.sha256) {
            throw new Error(
                `${sectionKey} checksum mismatch: template expects ${tag.sha256}, generated ${artifact.sha256}.`
            );
        }

        context[tag.tagName] = artifact.markdown.trim();
    }

    return Mustache.render(template, context).trim();
};
