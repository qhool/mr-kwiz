import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { generateSchemaDocsArtifact } from '../src/lib/generated-schema-reference';
import { generateMcpToolsDocsArtifact } from '../src/lib/mrkwiz-mcp-tools';

export const OUTPUT_PATH = path.resolve(process.cwd(), 'docs/quiz-schema-reference.md');
export const MCP_TOOLS_OUTPUT_PATH = path.resolve(process.cwd(), 'docs/mrkwiz-mcp-tools-reference.md');

export async function writeGeneratedSchemaDocs(
    outputPath = OUTPUT_PATH
): Promise<{ markdown: string; outputPath: string; sha256: string }> {
    const artifact = await generateSchemaDocsArtifact();

    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, artifact.markdown, 'utf8');

    return {
        ...artifact,
        outputPath,
    };
}

const result = await writeGeneratedSchemaDocs();
console.log(`Wrote ${path.relative(process.cwd(), result.outputPath)} (${result.sha256})`);

const mcpToolsArtifact = await generateMcpToolsDocsArtifact();
mkdirSync(path.dirname(MCP_TOOLS_OUTPUT_PATH), { recursive: true });
writeFileSync(MCP_TOOLS_OUTPUT_PATH, mcpToolsArtifact.markdown, 'utf8');
console.log(`Wrote ${path.relative(process.cwd(), MCP_TOOLS_OUTPUT_PATH)} (${mcpToolsArtifact.sha256})`);
