import Mustache from 'mustache';

export const GENERATED_SECTION_TAG_PATTERN = /^([a-z][a-z0-9]*(?:_[a-z0-9]+)*)_sha256_([0-9a-f]{64})$/;

export type GeneratedSectionTagInfo = {
    sectionKey: string;
    sha256: string;
    tagName: string;
};

type MustacheToken = [string, string?, number?, number?, MustacheToken[]?];

const collectGeneratedSectionTags = (tokens: MustacheToken[]): GeneratedSectionTagInfo[] => {
    const tags: GeneratedSectionTagInfo[] = [];

    for (const token of tokens) {
        const [type, name, , , nested] = token;

        if ((type === 'name' || type === '&') && typeof name === 'string') {
            const match = name.match(GENERATED_SECTION_TAG_PATTERN);
            if (match) {
                tags.push({ sectionKey: match[1]!, sha256: match[2]!, tagName: name });
            }
        }

        if (Array.isArray(nested)) {
            tags.push(...collectGeneratedSectionTags(nested));
        }
    }

    return tags;
};

export const getGeneratedSectionTags = (template: string): GeneratedSectionTagInfo[] => {
    return collectGeneratedSectionTags(Mustache.parse(template) as MustacheToken[]);
};

export const getGeneratedSectionTagInfo = (template: string, sectionKey: string): GeneratedSectionTagInfo => {
    const tags = getGeneratedSectionTags(template).filter((tag) => tag.sectionKey === sectionKey);

    if (tags.length === 0) {
        throw new Error(`Missing checksum-suffixed ${sectionKey} tag in template.`);
    }

    if (tags.length > 1) {
        throw new Error(`Expected exactly one checksum-suffixed ${sectionKey} tag, found ${tags.length}.`);
    }

    return tags[0]!;
};

export const getGeneratedSectionTagInfoByKey = (
    template: string,
    sectionKeys: readonly string[]
): Record<string, GeneratedSectionTagInfo> => {
    const tags = getGeneratedSectionTags(template);
    const byKey: Record<string, GeneratedSectionTagInfo> = {};

    for (const sectionKey of sectionKeys) {
        const matches = tags.filter((tag) => tag.sectionKey === sectionKey);

        if (matches.length === 0) {
            throw new Error(`Missing checksum-suffixed ${sectionKey} tag in template.`);
        }

        if (matches.length > 1) {
            throw new Error(`Expected exactly one checksum-suffixed ${sectionKey} tag, found ${matches.length}.`);
        }

        byKey[sectionKey] = matches[0]!;
    }

    const expected = new Set(sectionKeys);
    const unexpected = tags.filter((tag) => !expected.has(tag.sectionKey));
    if (unexpected.length > 0) {
        throw new Error(`Unexpected checksum-suffixed template tags: ${unexpected.map((tag) => tag.tagName).join(', ')}`);
    }

    return byKey;
};

export const buildGeneratedSectionTagName = (sectionKey: string, sha256: string): string => {
    if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(sectionKey)) {
        throw new Error(`Invalid generated section key: ${sectionKey}`);
    }

    if (!/^[0-9a-f]{64}$/.test(sha256)) {
        throw new Error(`Invalid generated section sha256: ${sha256}`);
    }

    return `${sectionKey}_sha256_${sha256}`;
};

export const sha256Hex = async (input: string): Promise<string> => {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', bytes);

    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
};
