import { z } from 'zod';

export const DEFAULT_MCP_TOKEN_TTL_DAYS = 30;

export const quizMcpTokenSchema = z.object({
    id: z.string().uuid(),
    quiz_id: z.string().uuid(),
    label: z.string(),
    notes: z.string(),
    callback_url: z.string().nullable(),
    callback_origin: z.string().nullable(),
    expires_at: z.string().nullable(),
    last_used_at: z.string().nullable(),
    revoked_at: z.string().nullable(),
    token_hash: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
});

export const listQuizMcpTokensResponseSchema = z.object({
    tokens: z.array(quizMcpTokenSchema),
});

export const createQuizMcpTokenRequestSchema = z.strictObject({
    expires_at: z.string().nullable().optional(),
    label: z.string().optional().default(''),
    notes: z.string().optional().default(''),
});

export const updateQuizMcpTokenRequestSchema = z.strictObject({
    callback_origin: z.string().nullable().optional(),
    callback_url: z.string().nullable().optional(),
    expires_at: z.string().nullable().optional(),
    label: z.string().optional(),
    notes: z.string().optional(),
});

export type QuizMcpToken = z.infer<typeof quizMcpTokenSchema>;
export type CreateQuizMcpTokenRequest = z.infer<typeof createQuizMcpTokenRequestSchema>;
export type UpdateQuizMcpTokenRequest = z.infer<typeof updateQuizMcpTokenRequestSchema>;

export const getDefaultMcpTokenExpiresAt = (now = new Date()): string => {
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + DEFAULT_MCP_TOKEN_TTL_DAYS);
    return expiresAt.toISOString();
};

export const getQuizMcpTokenStatus = (
    token: Pick<QuizMcpToken, 'expires_at' | 'revoked_at'>,
    now = new Date()
): 'active' | 'expired' | 'revoked' => {
    if (token.revoked_at) {
        return 'revoked';
    }

    if (token.expires_at && new Date(token.expires_at).getTime() <= now.getTime()) {
        return 'expired';
    }

    return 'active';
};

export const buildMcpTokenExpiredRecoveryInstructions = (): string[] => [
    'Tell the user their MrKwiz OpenCode token has expired.',
    'Ask them to open the MrKwiz admin page for this quiz.',
    'Guide them to AI Editing > MCP Tokens.',
    'Have them create a new OpenCode token.',
    'Have them paste the new bootstrap prompt into this OpenCode session.',
    'Do not ask for the quiz admin token unless the user explicitly chooses manual setup.',
];
