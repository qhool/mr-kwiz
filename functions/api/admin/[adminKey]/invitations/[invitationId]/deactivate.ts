import { type AppEnv } from '../../../../../utils/env';
import { handleAdminInvitationDeactivatePost } from '../../../handle-invitations';

type RouteContext = {
    env: Partial<AppEnv>;
    params: {
        adminKey?: string;
        invitationId?: string;
    };
};

export const onRequestPost = async ({ env, params }: RouteContext): Promise<Response> => {
    return handleAdminInvitationDeactivatePost(env, params.adminKey, params.invitationId);
};