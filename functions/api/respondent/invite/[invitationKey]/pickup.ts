import { type AppEnv } from '../../../../utils/env';
import { handleRespondentInvitationPickupPost } from '../../handle-respondent';

type RouteContext = {
    env: Partial<AppEnv>;
    params: {
        invitationKey?: string;
    };
    request: Request;
};

export const onRequestPost = async ({ env, params, request }: RouteContext): Promise<Response> => {
    return handleRespondentInvitationPickupPost(env, params.invitationKey, request);
};