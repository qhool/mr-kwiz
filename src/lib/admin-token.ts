const bytesToBase64Url = (bytes: Uint8Array): string => {
    let binary = '';

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

export const generateCapabilityToken = (): string => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
};

export const sha256Hex = async (value: string): Promise<string> => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
};

export const buildAdminEditUrl = (adminToken: string, baseUrl = 'http://localhost:3000'): string => {
    return `${baseUrl.replace(/\/$/, '')}/admin/${encodeURIComponent(adminToken)}/edit`;
};