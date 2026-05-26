import { z } from 'zod';

export const quizInvitationSchema = z.object({
    id: z.string().uuid(),
    invitation_key: z.string().min(1),
    label: z.string(),
    description: z.string(),
    max_uses: z.number().int().positive().nullable(),
    use_count: z.number().int().nonnegative(),
    expires_at: z.string().nullable(),
    revoked_at: z.string().nullable(),
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
});

export const updateQuizInvitationRequestSchema = z.strictObject({
    max_uses: z.number().int().positive().nullable(),
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