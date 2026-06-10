import { type AppEnv } from '../../../../../utils/env';
import { handleAdminMcpTokenBridgeActionPost } from '../../../handle-mcp-tokens';

type RouteContext = {
    env: Partial<AppEnv>;
    params: { adminKey?: string; tokenId?: string };
    request: Request;
};

export const onRequestPost = async ({ env, params, request }: RouteContext): Promise<Response> => {
    return handleAdminMcpTokenBridgeActionPost(env, params.adminKey, params.tokenId, request);
};
