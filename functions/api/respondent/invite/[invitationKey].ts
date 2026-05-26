import { type AppEnv } from '../../../utils/env';
import { handleRespondentInvitationGet } from '../handle-respondent';

type RouteContext = {
    env: Partial<AppEnv>;
    params: {
        invitationKey?: string;
    };
};

export const onRequestGet = async ({ env, params }: RouteContext): Promise<Response> => {
    return handleRespondentInvitationGet(env, params.invitationKey);
};