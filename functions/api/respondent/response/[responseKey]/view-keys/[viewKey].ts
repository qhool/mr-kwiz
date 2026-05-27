import { type AppEnv } from '../../../../../utils/env';
import { handleRespondentViewKeyPatch } from '../../../handle-respondent';

type RouteContext = {
    env: Partial<AppEnv>;
    params: {
        responseKey?: string;
        viewKey?: string;
    };
    request: Request;
};

export const onRequestPatch = async ({ env, params, request }: RouteContext): Promise<Response> => {
    return handleRespondentViewKeyPatch(env, params.responseKey, params.viewKey, request);
};