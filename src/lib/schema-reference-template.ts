import Mustache from 'mustache';

export const SCHEMA_REFERENCE_TAG_PATTERN = /^schema_reference_sha256_([0-9a-f]{64})$/;

type SchemaReferenceTagInfo = {
    sha256: string;
    tagName: string;
};

type MustacheToken = [string, string?, number?, number?, MustacheToken[]?];

const collectSchemaReferenceTags = (tokens: MustacheToken[]): string[] => {
    const names: string[] = [];

    for (const token of tokens) {
        const [type, name, , , nested] = token;

        if ((type === 'name' || type === '&') && typeof name === 'string' && SCHEMA_REFERENCE_TAG_PATTERN.test(name)) {
            names.push(name);
        }

        if (Array.isArray(nested)) {
            names.push(...collectSchemaReferenceTags(nested));
        }
    }

    return names;
};

export const getSchemaReferenceTagInfo = (template: string): SchemaReferenceTagInfo => {
    const tags = collectSchemaReferenceTags(Mustache.parse(template) as MustacheToken[]);

    if (tags.length === 0) {
        throw new Error('Missing checksum-suffixed schema reference tag in skill template.');
    }

    if (tags.length > 1) {
        throw new Error(`Expected exactly one checksum-suffixed schema reference tag, found ${tags.length}.`);
    }

    const tagName = tags[0]!;
    const match = tagName.match(SCHEMA_REFERENCE_TAG_PATTERN);

    if (!match) {
        throw new Error(`Invalid schema reference tag name: ${tagName}`);
    }

    return {
        sha256: match[1],
        tagName,
    };
};

export const buildSchemaReferenceTagName = (sha256: string): string => {
    return `schema_reference_sha256_${sha256}`;
};