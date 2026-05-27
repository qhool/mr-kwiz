import { type AppEnv } from '../../../../utils/env';
import { handleRespondentViewKeyPost, handleRespondentViewKeysGet } from '../../handle-respondent';

type RouteContext = {
    env: Partial<AppEnv>;
    params: {
        responseKey?: string;
    };
    request: Request;
};

export const onRequestGet = async ({ env, params }: RouteContext): Promise<Response> => {
    return handleRespondentViewKeysGet(env, params.responseKey);
};

export const onRequestPost = async ({ env, params, request }: RouteContext): Promise<Response> => {
    return handleRespondentViewKeyPost(env, params.responseKey, request);
};import { type AppEnv } from '../../../../utils/env';
import { handleRespondentViewKeyPost } from '../../handle-respondent';

type RouteContext = {
    env: Partial<AppEnv>;
    params: {
        responseKey?: string;
    };
    request: Request;
};

export const onRequestPost = async ({ env, params, request }: RouteContext): Promise<Response> => {
    return handleRespondentViewKeyPost(env, params.responseKey, request);
};
