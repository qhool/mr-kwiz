import { type AppEnv } from '../../../../utils/env';
import { handleAdminInvitationPatch } from '../../handle-invitations';

type RouteContext = {
    env: Partial<AppEnv>;
    params: {
        adminKey?: string;
        invitationId?: string;
    };
    request: Request;
};

export const onRequestPatch = async ({ env, params, request }: RouteContext): Promise<Response> => {
    return handleAdminInvitationPatch(env, params.adminKey, params.invitationId, request);
};