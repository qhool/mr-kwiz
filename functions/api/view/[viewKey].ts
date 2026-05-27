import { type AppEnv } from '../../../utils/env';
import { handleViewKeyGet } from '../handle-respondent';

type RouteContext = {
    env: Partial<AppEnv>;
    params: {
        viewKey?: string;
    };
};

export const onRequestGet = async ({ env, params }: RouteContext): Promise<Response> => {
    return handleViewKeyGet(env, params.viewKey);
};
