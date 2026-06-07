import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { generateSchemaDocsArtifact } from '../src/lib/generated-schema-reference';
import { getGeneratedSectionTagInfoByKey } from '../src/lib/generated-template-sections';
import { generateMcpToolsDocsArtifact } from '../src/lib/mrkwiz-mcp-tools';

type SectionKey = 'mcp_tools' | 'schema_reference';

type Artifact = {
    markdown: string;
    outputPath: string;
    sha256: string;
};

const TEMPLATE_CHECKS: Array<{ path: string; sectionKeys: readonly SectionKey[] }> = [
    { path: 'docs/skill-template.md.mustache', sectionKeys: ['schema_reference'] },
    { path: 'docs/mrkwiz-quiz-author.SKILL.md.mustache', sectionKeys: ['mcp_tools', 'schema_reference'] },
];

const buildArtifacts = async (): Promise<Record<SectionKey, Artifact>> => ({
    mcp_tools: {
        ...(await generateMcpToolsDocsArtifact()),
        outputPath: path.resolve(process.cwd(), 'docs/mrkwiz-mcp-tools-reference.md'),
    },
    schema_reference: {
        ...(await generateSchemaDocsArtifact()),
        outputPath: path.resolve(process.cwd(), 'docs/quiz-schema-reference.md'),
    },
});

const main = async () => {
    const artifacts = await buildArtifacts();

    for (const artifact of Object.values(artifacts)) {
        mkdirSync(path.dirname(artifact.outputPath), { recursive: true });
        writeFileSync(artifact.outputPath, artifact.markdown, 'utf8');
    }

    for (const check of TEMPLATE_CHECKS) {
        const templatePath = path.resolve(process.cwd(), check.path);
        const template = readFileSync(templatePath, 'utf8');
        const tags = getGeneratedSectionTagInfoByKey(template, check.sectionKeys);

        for (const sectionKey of check.sectionKeys) {
            const tag = tags[sectionKey];
            const artifact = artifacts[sectionKey];

            if (artifact.sha256 !== tag.sha256) {
                throw new Error(
                    [
                        'Generated section checksum mismatch.',
                        `Template: ${check.path}`,
                        `Template tag: ${tag.tagName}`,
                        `Expected sha256: ${tag.sha256}`,
                        `Generated sha256: ${artifact.sha256}`,
                        `Wrote generated section to: ${path.relative(process.cwd(), artifact.outputPath)}`,
                    ].join('\n')
                );
            }
        }
    }

    console.log(
        `Generated sections verified (${Object.entries(artifacts)
            .map(([sectionKey, artifact]) => `${sectionKey}: ${artifact.sha256}`)
            .join(', ')})`
    );
};

await main();
