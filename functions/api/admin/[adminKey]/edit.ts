import { type AppEnv } from '../../../utils/env';
import { handleAdminEditGet, handleAdminEditPost } from '../handle-edit';

type RouteContext = {
    env: Partial<AppEnv>;
    params: {
        adminKey?: string;
    };
    request: Request;
};

export const onRequestGet = async ({ env, params }: RouteContext): Promise<Response> => {
    return handleAdminEditGet(env, params.adminKey);
};

export const onRequestPost = async ({ env, params, request }: RouteContext): Promise<Response> => {
    return handleAdminEditPost(env, params.adminKey, request);
};