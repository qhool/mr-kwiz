import { type AppEnv } from '../../../utils/env';
import { handleAdminInvitationsGet, handleAdminInvitationsPost } from '../handle-invitations';

type RouteContext = {
    env: Partial<AppEnv>;
    params: {
        adminKey?: string;
    };
    request: Request;
};

export const onRequestGet = async ({ env, params }: RouteContext): Promise<Response> => {
    return handleAdminInvitationsGet(env, params.adminKey);
};

export const onRequestPost = async ({ env, params, request }: RouteContext): Promise<Response> => {
    return handleAdminInvitationsPost(env, params.adminKey, request);
};