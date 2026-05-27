import { z } from 'zod';

export const responseViewKeySchema = z.object({
    id: z.string().uuid(),
    response_id: z.string().uuid(),
    invitation_id: z.string().uuid().nullable(),
    view_key: z.string().min(1),
    label: z.string(),
    notes: z.string(),
    expires_at: z.string().nullable(),
    last_viewed_at: z.string().nullable(),
    revoked_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
});

export type ResponseViewKey = z.infer<typeof responseViewKeySchema>;

export const listResponseViewKeysResponseSchema = z.object({
    view_keys: z.array(responseViewKeySchema),
});

export const buildViewUrl = (viewKey: string, origin: string): string => {
    return `${origin.replace(/\/$/, '')}/view/${encodeURIComponent(viewKey)}`;
};

export const createResponseViewKeyRequestSchema = z.strictObject({
    expires_at: z.string().nullable().optional().default(null),
    label: z.string().optional().default(''),
    notes: z.string().optional().default(''),
});

export type CreateResponseViewKeyRequest = z.infer<typeof createResponseViewKeyRequestSchema>;

export const updateResponseViewKeyRequestSchema = z.strictObject({
    expires_at: z.string().nullable(),
    label: z.string(),
    notes: z.string(),
});

export type UpdateResponseViewKeyRequest = z.infer<typeof updateResponseViewKeyRequestSchema>;

export type ListResponseViewKeysResponse = z.infer<typeof listResponseViewKeysResponseSchema>;

export const getViewKeyStatus = (
    viewKey: Pick<ResponseViewKey, 'expires_at' | 'revoked_at'>,
    now = new Date()
): 'active' | 'expired' | 'revoked' => {
    if (viewKey.revoked_at) {
        return 'revoked';
    }

    if (viewKey.expires_at && new Date(viewKey.expires_at).getTime() <= now.getTime()) {
        return 'expired';
    }

    return 'active';
};
