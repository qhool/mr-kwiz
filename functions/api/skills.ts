import { MRKWIZ_SKILL_NAMES, renderMrKwizSkill } from '../../src/lib/mrkwiz-skills';

const skillCatalog = () => ({
    skills: MRKWIZ_SKILL_NAMES.map((name) => ({
        name,
        files: ['SKILL.md'],
    })),
});

export const handleSkillsGet = async (request: Request, path = ''): Promise<Response> => {
    const normalizedPath = path.replace(/^\/+|\/+$/g, '');

    if (!normalizedPath || normalizedPath === 'index.json') {
        return new Response(JSON.stringify(skillCatalog()), {
            headers: { 'content-type': 'application/json; charset=utf-8' },
        });
    }

    const match = normalizedPath.match(/^([^/]+)\/SKILL\.md$/);
    if (match) {
        const skill = await renderMrKwizSkill(match[1]!);
        if (!skill) return new Response('Skill not found.', { status: 404 });
        return new Response(skill, {
            headers: { 'content-type': 'text/markdown; charset=utf-8' },
        });
    }

    return new Response('Skill not found.', { status: 404 });
};
