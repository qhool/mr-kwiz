import { z } from 'zod';

import { responseViewKeySchema } from './view-keys';

export const resultSharingModeSchema = z.enum(['off', 'opt_in', 'opt_out', 'mandatory']);
export type ResultSharingMode = z.infer<typeof resultSharingModeSchema>;

export const quizInvitationSchema = z.object({
    id: z.string().uuid(),
    invitation_key: z.string().min(1),
    label: z.string(),
    description: z.string(),
    max_uses: z.number().int().positive().nullable(),
    quiz_id: z.string().uuid(),
    use_count: z.number().int().nonnegative(),
    expires_at: z.string().nullable(),
    revoked_at: z.string().nullable(),
    result_sharing_mode: resultSharingModeSchema,
    shareback_name: z.string(),
    shared_view_keys: z.array(responseViewKeySchema).default([]),
    created_at: z.string(),
    updated_at: z.string(),
});

export const listQuizInvitationsResponseSchema = z.object({
    invitations: z.array(quizInvitationSchema),
});

export const createQuizInvitationRequestSchema = z.strictObject({
    description: z.string().optional().default(''),
    label: z.string().optional().default(''),
    max_uses: z.number().int().positive().nullable().optional().default(null),
    result_sharing_mode: resultSharingModeSchema.optional().default('off'),
    shareback_name: z.string().optional().default(''),
}).superRefine((payload, ctx) => {
    if (payload.result_sharing_mode !== 'off' && payload.shareback_name.trim().length === 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Share-back name is required when result sharing is enabled.',
            path: ['shareback_name'],
        });
    }
});

export const updateQuizInvitationRequestSchema = z.strictObject({
    max_uses: z.number().int().positive().nullable().optional(),
    result_sharing_mode: resultSharingModeSchema.optional(),
    shareback_name: z.string().optional(),
}).superRefine((payload, ctx) => {
    if (
        payload.result_sharing_mode !== undefined &&
        payload.result_sharing_mode !== 'off' &&
        payload.shareback_name !== undefined &&
        payload.shareback_name.trim().length === 0
    ) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Share-back name is required when result sharing is enabled.',
            path: ['shareback_name'],
        });
    }
});

export type QuizInvitation = z.infer<typeof quizInvitationSchema>;
export type ListQuizInvitationsResponse = z.infer<typeof listQuizInvitationsResponseSchema>;
export type CreateQuizInvitationRequest = z.infer<typeof createQuizInvitationRequestSchema>;
export type UpdateQuizInvitationRequest = z.infer<typeof updateQuizInvitationRequestSchema>;

export const buildInvitationUrl = (invitationKey: string, origin: string): string => {
    return `${origin.replace(/\/$/, '')}/invite/${encodeURIComponent(invitationKey)}`;
};

export const getQuizInvitationStatus = (
    invitation: Pick<QuizInvitation, 'expires_at' | 'max_uses' | 'revoked_at' | 'use_count'>,
    now = new Date()
): 'active' | 'deactivated' | 'exhausted' | 'expired' => {
    if (invitation.revoked_at) {
        return 'deactivated';
    }

    if (invitation.expires_at && new Date(invitation.expires_at).getTime() <= now.getTime()) {
        return 'expired';
    }

    if (invitation.max_uses !== null && invitation.use_count >= invitation.max_uses) {
        return 'exhausted';
    }

    return 'active';
};
