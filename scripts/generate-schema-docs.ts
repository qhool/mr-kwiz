import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { generateSchemaDocsArtifact } from '../src/lib/generated-schema-reference';

export const OUTPUT_PATH = path.resolve(process.cwd(), 'docs/quiz-schema-reference.md');

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