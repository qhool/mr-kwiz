import {
    buildGeneratedSectionTagName,
    getGeneratedSectionTagInfo,
    type GeneratedSectionTagInfo,
} from './generated-template-sections';

export const SCHEMA_REFERENCE_TAG_PATTERN = /^schema_reference_sha256_([0-9a-f]{64})$/;

type SchemaReferenceTagInfo = Omit<GeneratedSectionTagInfo, 'sectionKey'>;

export const getSchemaReferenceTagInfo = (template: string): SchemaReferenceTagInfo => {
    const tag = getGeneratedSectionTagInfo(template, 'schema_reference');
    return {
        sha256: tag.sha256,
        tagName: tag.tagName,
    };
};

export const buildSchemaReferenceTagName = (sha256: string): string => {
    return buildGeneratedSectionTagName('schema_reference', sha256);
};
