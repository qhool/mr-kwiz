import { type AppEnv } from '../../../../utils/env';
import { handleRespondentAnswerPost } from '../../handle-respondent';

type RouteContext = {
    env: Partial<AppEnv>;
    params: {
        responseKey?: string;
    };
    request: Request;
};

export const onRequestPost = async ({ env, params, request }: RouteContext): Promise<Response> => {
    return handleRespondentAnswerPost(env, params.responseKey, request);
};