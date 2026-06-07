import { renderMrKwizQuizAuthorSkill } from '../../src/lib/mrkwiz-quiz-author-skill';

const skillCatalog = () => ({
    skills: [
        {
            name: 'mrkwiz-quiz-author',
            files: ['SKILL.md'],
        },
    ],
});

export const handleSkillsGet = async (request: Request, path = ''): Promise<Response> => {
    const normalizedPath = path.replace(/^\/+|\/+$/g, '');

    if (!normalizedPath || normalizedPath === 'index.json') {
        return new Response(JSON.stringify(skillCatalog()), {
            headers: { 'content-type': 'application/json; charset=utf-8' },
        });
    }

    if (normalizedPath === 'mrkwiz-quiz-author/SKILL.md') {
        return new Response(await renderMrKwizQuizAuthorSkill(), {
            headers: { 'content-type': 'text/markdown; charset=utf-8' },
        });
    }

    return new Response('Skill not found.', { status: 404 });
};
