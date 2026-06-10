import { type AppEnv } from '../../../utils/env';
import { handleAdminMcpTokensGet, handleAdminMcpTokensPost } from '../handle-mcp-tokens';

type RouteContext = {
    env: Partial<AppEnv>;
    params: { adminKey?: string };
    request: Request;
};

export const onRequestGet = async ({ env, params }: RouteContext): Promise<Response> => {
    return handleAdminMcpTokensGet(env, params.adminKey);
};

export const onRequestPost = async ({ env, params, request }: RouteContext): Promise<Response> => {
    return handleAdminMcpTokensPost(env, params.adminKey, request);
};
