import { type AppEnv } from './utils/env';
import { handleMcpGet, handleMcpOptions, handleMcpPost } from './api/mcp';

type RouteContext = {
    env: Partial<AppEnv>;
    request: Request;
};

export const onRequestOptions = async (): Promise<Response> => handleMcpOptions();

export const onRequestGet = async (): Promise<Response> => handleMcpGet();

export const onRequestPost = async ({ env, request }: RouteContext): Promise<Response> => {
    return handleMcpPost(env, request);
};
