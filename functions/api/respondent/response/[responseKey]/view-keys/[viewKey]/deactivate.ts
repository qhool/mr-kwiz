import { type AppEnv } from '../../../../../../utils/env';
import { handleRespondentViewKeyDeactivatePost } from '../../../../handle-respondent';

type RouteContext = {
    env: Partial<AppEnv>;
    params: {
        responseKey?: string;
        viewKey?: string;
    };
};

export const onRequestPost = async ({ env, params }: RouteContext): Promise<Response> => {
    return handleRespondentViewKeyDeactivatePost(env, params.responseKey, params.viewKey);
};