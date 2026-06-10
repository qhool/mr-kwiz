import { type AppEnv } from '../../../../utils/env';
import { handleAdminMcpTokenPatch } from '../../handle-mcp-tokens';

type RouteContext = {
    env: Partial<AppEnv>;
    params: { adminKey?: string; tokenId?: string };
    request: Request;
};

export const onRequestPatch = async ({ env, params, request }: RouteContext): Promise<Response> => {
    return handleAdminMcpTokenPatch(env, params.adminKey, params.tokenId, request);
};
