import { handleAdminEditGet, handleAdminEditPost } from '../functions/api/admin/handle-edit';
import {
    handleAdminInvitationDeactivatePost,
    handleAdminInvitationPatch,
    handleAdminInvitationsGet,
    handleAdminInvitationsPost,
} from '../functions/api/admin/handle-invitations';
import {
    handleAdminMcpTokenBridgeActionPost,
    handleAdminMcpTokenCallbackStatusGet,
    handleAdminMcpTokenPatch,
    handleAdminMcpTokenRevokePost,
    handleAdminMcpTokensGet,
    handleAdminMcpTokensPost,
} from '../functions/api/admin/handle-mcp-tokens';
import {
    handleRespondentAnswerPost,
    handleRespondentInvitationGet,
    handleRespondentInvitationPickupPost,
    handleRespondentSessionGet,
    handleRespondentViewKeyDeactivatePost,
    handleRespondentViewKeyPost,
    handleRespondentViewKeyPatch,
    handleRespondentViewKeysGet,
    handleViewKeyGet,
} from '../functions/api/respondent/handle-respondent';
import { handleMcpGet, handleMcpOptions, handleMcpPost } from '../functions/api/mcp';
import { handleSkillsGet } from '../functions/api/skills';
import type { AppEnv } from '../functions/utils/env';

type WorkerEnv = AppEnv & { ASSETS: Fetcher };

const adminEditPattern = /^\/api\/admin\/([^/]+)\/edit\/?$/;
const adminInvitationsPattern = /^\/api\/admin\/([^/]+)\/invitations\/?$/;
const adminInvitationDetailPattern = /^\/api\/admin\/([^/]+)\/invitations\/([^/]+)\/?$/;
const adminInvitationDeactivatePattern = /^\/api\/admin\/([^/]+)\/invitations\/([^/]+)\/deactivate\/?$/;
const adminMcpTokensPattern = /^\/api\/admin\/([^/]+)\/mcp-tokens\/?$/;
const adminMcpTokenBridgeActionPattern = /^\/api\/admin\/([^/]+)\/mcp-tokens\/([^/]+)\/bridge-action\/?$/;
const adminMcpTokenCallbackStatusPattern = /^\/api\/admin\/([^/]+)\/mcp-tokens\/([^/]+)\/callback-status\/?$/;
const adminMcpTokenDetailPattern = /^\/api\/admin\/([^/]+)\/mcp-tokens\/([^/]+)\/?$/;
const adminMcpTokenRevokePattern = /^\/api\/admin\/([^/]+)\/mcp-tokens\/([^/]+)\/revoke\/?$/;
const respondentInvitationPattern = /^\/api\/respondent\/invite\/([^/]+)\/?$/;
const respondentInvitationPickupPattern = /^\/api\/respondent\/invite\/([^/]+)\/pickup\/?$/;
const respondentResponsePattern = /^\/api\/respondent\/response\/([^/]+)\/?$/;
const respondentAnswerPattern = /^\/api\/respondent\/response\/([^/]+)\/answer\/?$/;
const respondentViewKeysPattern = /^\/api\/respondent\/response\/([^/]+)\/view-keys\/?$/;
const respondentViewKeyDetailPattern = /^\/api\/respondent\/response\/([^/]+)\/view-keys\/([^/]+)\/?$/;
const respondentViewKeyDeactivatePattern = /^\/api\/respondent\/response\/([^/]+)\/view-keys\/([^/]+)\/deactivate\/?$/;
const respondentViewKeyPattern = /^\/api\/view\/([^/]+)\/?$/;
const mcpPattern = /^\/mcp\/?$/;
const skillsPattern = /^\/\.well-known\/skills\/?(.*)$/;

/**
 * Routes an API request to the appropriate handler. Returns null if the
 * request does not match any API route (caller should fall through to asset
 * serving or next middleware).
 */
export const routeApiRequest = async (request: Request, env: AppEnv): Promise<Response | null> => {
    const { pathname } = new URL(request.url);
    const method = request.method;

    let match: RegExpMatchArray | null;

    if (pathname.match(mcpPattern)) {
        if (method === 'OPTIONS') return handleMcpOptions();
        if (method === 'GET') return handleMcpGet();
        if (method === 'POST') return handleMcpPost(env, request);
    }

    if ((match = pathname.match(skillsPattern)) && method === 'GET') {
        return handleSkillsGet(request, decodeURIComponent(match[1] ?? ''));
    }

    if ((match = pathname.match(adminMcpTokenRevokePattern)) && method === 'POST') {
        return handleAdminMcpTokenRevokePost(env, decodeURIComponent(match[1]), decodeURIComponent(match[2]));
    }

    if ((match = pathname.match(adminMcpTokenCallbackStatusPattern)) && method === 'GET') {
        return handleAdminMcpTokenCallbackStatusGet(env, decodeURIComponent(match[1]), decodeURIComponent(match[2]));
    }

    if ((match = pathname.match(adminMcpTokenBridgeActionPattern)) && method === 'POST') {
        return handleAdminMcpTokenBridgeActionPost(env, decodeURIComponent(match[1]), decodeURIComponent(match[2]), request);
    }

    if ((match = pathname.match(adminMcpTokenDetailPattern)) && method === 'PATCH') {
        return handleAdminMcpTokenPatch(env, decodeURIComponent(match[1]), decodeURIComponent(match[2]), request);
    }

    if ((match = pathname.match(adminMcpTokensPattern))) {
        if (method === 'GET') return handleAdminMcpTokensGet(env, decodeURIComponent(match[1]));
        if (method === 'POST') return handleAdminMcpTokensPost(env, decodeURIComponent(match[1]), request);
    }

    if ((match = pathname.match(adminInvitationDeactivatePattern)) && method === 'POST') {
        return handleAdminInvitationDeactivatePost(env, decodeURIComponent(match[1]), decodeURIComponent(match[2]));
    }

    if ((match = pathname.match(adminInvitationDetailPattern)) && method === 'PATCH') {
        return handleAdminInvitationPatch(env, decodeURIComponent(match[1]), decodeURIComponent(match[2]), request);
    }

    if ((match = pathname.match(adminInvitationsPattern))) {
        if (method === 'GET') return handleAdminInvitationsGet(env, decodeURIComponent(match[1]));
        if (method === 'POST') return handleAdminInvitationsPost(env, decodeURIComponent(match[1]), request);
    }

    if ((match = pathname.match(adminEditPattern))) {
        if (method === 'GET') return handleAdminEditGet(env, decodeURIComponent(match[1]));
        if (method === 'POST') return handleAdminEditPost(env, decodeURIComponent(match[1]), request);
    }

    if ((match = pathname.match(respondentInvitationPickupPattern)) && method === 'POST') {
        return handleRespondentInvitationPickupPost(env, decodeURIComponent(match[1]), request);
    }

    if ((match = pathname.match(respondentInvitationPattern)) && method === 'GET') {
        return handleRespondentInvitationGet(env, decodeURIComponent(match[1]));
    }

    if ((match = pathname.match(respondentAnswerPattern)) && method === 'POST') {
        return handleRespondentAnswerPost(env, decodeURIComponent(match[1]), request);
    }

    if ((match = pathname.match(respondentViewKeyDeactivatePattern)) && method === 'POST') {
        return handleRespondentViewKeyDeactivatePost(env, decodeURIComponent(match[1]), decodeURIComponent(match[2]));
    }

    if ((match = pathname.match(respondentViewKeyDetailPattern)) && method === 'PATCH') {
        return handleRespondentViewKeyPatch(env, decodeURIComponent(match[1]), decodeURIComponent(match[2]), request);
    }

    if ((match = pathname.match(respondentViewKeysPattern))) {
        if (method === 'GET') return handleRespondentViewKeysGet(env, decodeURIComponent(match[1]));
        if (method === 'POST') return handleRespondentViewKeyPost(env, decodeURIComponent(match[1]), request);
    }

    if ((match = pathname.match(respondentResponsePattern)) && method === 'GET') {
        return handleRespondentSessionGet(env, decodeURIComponent(match[1]));
    }

    if ((match = pathname.match(respondentViewKeyPattern)) && method === 'GET') {
        return handleViewKeyGet(env, decodeURIComponent(match[1]));
    }

    return null;
};

export default {
    async fetch(request: Request, env: WorkerEnv): Promise<Response> {
        const routedResponse = await routeApiRequest(request, env);

        if (routedResponse) {
            return routedResponse;
        }

        try {
            if (env.ASSETS?.fetch) {
                return await env.ASSETS.fetch(request);
            }

            return await fetch(request);
        } catch (error) {
            const { pathname } = new URL(request.url);
            console.error('Asset fetch failed', {
                error: error instanceof Error ? error.message : String(error),
                pathname,
                url: request.url,
            });

            return new Response('Unable to load this resource right now.', {
                status: 502,
                statusText: 'Asset Fetch Failed',
            });
        }
    },
};
