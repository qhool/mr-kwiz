import type { ThemeColors } from './quiz-definition';

export type ResolvedThemeColors = Required<ThemeColors>;
export type ThemeUiColors = {
    accent_soft: string;
    danger_background: string;
    danger_border: string;
    danger_text: string;
    info_background: string;
    info_border: string;
    info_text: string;
    success_background: string;
    success_border: string;
    success_text: string;
};

export const defaultThemeColors: ResolvedThemeColors = {
    page_background: '#f4f0e8',
    panel_background: '#f8f7f3',
    panel_border: '#b8ae98',
    heading_text: '#241d14',
    body_text: '#2d2318',
    muted_text: '#6b5734',
    accent: '#6a5032',
    accent_text: '#f6f0df',
    chart_positive: '#a24a34',
    chart_negative: '#245a78',
    chart_grid: '#8f7a57',
    chart_band: '#7a4d2a',
};

export const resolveThemeColors = (themeColors?: ThemeColors): ResolvedThemeColors => {
    return {
        ...defaultThemeColors,
        ...(themeColors ?? {}),
    };
};

const hexToRgb = (hex: string): [number, number, number] => {
    const normalized = hex.replace('#', '').slice(0, 6);
    return [
        parseInt(normalized.slice(0, 2), 16),
        parseInt(normalized.slice(2, 4), 16),
        parseInt(normalized.slice(4, 6), 16),
    ];
};

const rgba = (hex: string, alpha: number): string => {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const deriveThemeUiColors = (colors: ResolvedThemeColors): ThemeUiColors => {
    return {
        accent_soft: rgba(colors.accent, 0.18),
        danger_background: 'rgba(251, 233, 231, 0.9)',
        danger_border: '#d86b47',
        danger_text: '#6f2412',
        info_background: rgba(colors.accent, 0.12),
        info_border: rgba(colors.accent, 0.45),
        info_text: colors.body_text,
        success_background: 'rgba(237, 247, 237, 0.9)',
        success_border: '#5a8f5a',
        success_text: '#1f4f1f',
    };
};
