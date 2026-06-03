import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { generateSchemaDocsArtifact } from '../src/lib/generated-schema-reference';
import { getSchemaReferenceTagInfo } from '../src/lib/schema-reference-template';

const TEMPLATE_PATH = path.resolve(process.cwd(), 'docs/skill-template.md.mustache');
const OUTPUT_PATH = path.resolve(process.cwd(), 'docs/quiz-schema-reference.md');

const main = async () => {
    const template = readFileSync(TEMPLATE_PATH, 'utf8');
    const tag = getSchemaReferenceTagInfo(template);
    const artifact = await generateSchemaDocsArtifact();

    mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(OUTPUT_PATH, artifact.markdown, 'utf8');

    if (artifact.sha256 !== tag.sha256) {
        throw new Error(
            [
                'Schema reference checksum mismatch.',
                `Template tag: ${tag.tagName}`,
                `Expected sha256: ${tag.sha256}`,
                `Generated sha256: ${artifact.sha256}`,
                `Wrote generated schema to: ${path.relative(process.cwd(), OUTPUT_PATH)}`,
            ].join('\n')
        );
    }

    console.log(`Schema reference verified (${artifact.sha256})`);
};

await main();