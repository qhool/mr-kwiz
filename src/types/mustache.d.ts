declare module 'mustache' {
    export type Token = [string, string?, number?, number?, Token[]?];

    export type RenderConfig = {
        escape?: (value: string) => string;
        tags?: [string, string];
    };

    const Mustache: {
        parse(template: string, tags?: [string, string]): Token[];
        render(
            template: string,
            view: unknown,
            partials?: Record<string, string> | ((name: string) => string | undefined),
            config?: RenderConfig
        ): string;
    };

    export default Mustache;
}
