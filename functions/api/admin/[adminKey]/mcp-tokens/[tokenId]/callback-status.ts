import { type AppEnv } from '../../../../../utils/env';
import { handleAdminMcpTokenCallbackStatusGet } from '../../../handle-mcp-tokens';

type RouteContext = {
    env: Partial<AppEnv>;
    params: { adminKey?: string; tokenId?: string };
};

export const onRequestGet = async ({ env, params }: RouteContext): Promise<Response> => {
    return handleAdminMcpTokenCallbackStatusGet(env, params.adminKey, params.tokenId);
};
