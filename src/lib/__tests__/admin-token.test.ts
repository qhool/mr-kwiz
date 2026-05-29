import { describe, expect, it } from 'vitest';

import { buildAdminEditUrl, generateCapabilityToken, sha256Hex } from '../admin-token';

describe('sha256Hex', () => {
    it.each([
        {
            input: '',
            output: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
        {
            input: 'abc',
            output: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        },
        {
            input: 'MrKwiz',
            output: '273d569f80efc2bc4451492c8fe9e49272d39f717b9c2049563b887cf9f22795',
        },
    ])('returns the expected digest for "$input"', async ({ input, output }) => {
        await expect(sha256Hex(input)).resolves.toBe(output);
    });
});

describe('generateCapabilityToken', () => {
    it('returns a 43-character base64url token for 32 random bytes', () => {
        const token = generateCapabilityToken();

        expect(token).toHaveLength(43);
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('does not include base64 padding characters', () => {
        expect(generateCapabilityToken()).not.toContain('=');
    });
});

describe('buildAdminEditUrl', () => {
    it('normalizes a trailing slash on the base URL', () => {
        expect(buildAdminEditUrl('token-123', 'https://example.com/')).toBe(
            'https://example.com/admin/token-123/edit'
        );
    });

    it('URL-encodes reserved characters in the token', () => {
        expect(buildAdminEditUrl('token/with spaces?', 'https://example.com/app')).toBe(
            'https://example.com/app/admin/token%2Fwith%20spaces%3F/edit'
        );
    });
});