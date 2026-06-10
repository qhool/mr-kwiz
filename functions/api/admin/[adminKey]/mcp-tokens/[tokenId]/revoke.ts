import { type AppEnv } from '../../../../../utils/env';
import { handleAdminMcpTokenRevokePost } from '../../../handle-mcp-tokens';

type RouteContext = {
    env: Partial<AppEnv>;
    params: { adminKey?: string; tokenId?: string };
};

export const onRequestPost = async ({ env, params }: RouteContext): Promise<Response> => {
    return handleAdminMcpTokenRevokePost(env, params.adminKey, params.tokenId);
};
