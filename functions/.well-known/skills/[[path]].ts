import { handleSkillsGet } from '../../api/skills';

type RouteContext = {
    params: { path?: string[] };
    request: Request;
};

export const onRequestGet = async ({ params, request }: RouteContext): Promise<Response> => {
    return handleSkillsGet(request, params.path?.join('/') ?? '');
};
