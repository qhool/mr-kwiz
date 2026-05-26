import { type AppEnv } from '../../../utils/env';
import { handleRespondentSessionGet } from '../handle-respondent';

type RouteContext = {
    env: Partial<AppEnv>;
    params: {
        responseKey?: string;
    };
};

export const onRequestGet = async ({ env, params }: RouteContext): Promise<Response> => {
    return handleRespondentSessionGet(env, params.responseKey);
};