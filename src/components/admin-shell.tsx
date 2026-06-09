import React from 'react';
import { NavLink } from 'react-router-dom';

import type { AdminQuizMetadata } from '../hooks/useAdminQuizDefinition';
import type { ThemeColors } from '../lib/quiz-definition';
import type { StoredAdminSession, StoredRespondentSession } from '../lib/respondent-quiz';
import { listStoredAdminSessions, listStoredRespondentSessions } from '../lib/respondent-quiz';
import { deriveThemeUiColors, resolveThemeColors } from '../lib/theme-colors';
import { SessionNavigationModal } from './session-navigation';

type AdminPage = 'edit' | 'preview' | 'invitations';

type AdminShellProps = {
    adminKey?: string;
    children: React.ReactNode;
    currentPage: AdminPage;
    metadata: AdminQuizMetadata | null;
    themeColors?: ThemeColors;
};

const navItems: Array<{ id: AdminPage; label: string; path: (adminKey: string) => string }> = [
    { id: 'edit', label: 'Edit', path: (adminKey) => `/admin/${encodeURIComponent(adminKey)}/edit` },
    { id: 'preview', label: 'Preview', path: (adminKey) => `/admin/${encodeURIComponent(adminKey)}/preview` },
    { id: 'invitations', label: 'Invitations', path: (adminKey) => `/admin/${encodeURIComponent(adminKey)}/invitations` },
];

const navLinkStyle = (isActive: boolean, accent: string, accentText: string, borderColor: string): React.CSSProperties => ({
    background: isActive ? accent : 'transparent',
    border: `1px solid ${isActive ? accent : borderColor}`,
    borderRadius: 999,
    color: isActive ? accentText : accent,
    display: 'inline-flex',
    padding: '0.55rem 1rem',
    textDecoration: 'none',
});

export const AdminShell: React.FC<AdminShellProps> = ({ adminKey, children, currentPage, metadata, themeColors }) => {
    const [isNavigationOpen, setIsNavigationOpen] = React.useState(false);
    const [adminSessions, setAdminSessions] = React.useState<StoredAdminSession[]>([]);
    const [respondentSessions, setRespondentSessions] = React.useState<StoredRespondentSession[]>([]);
    const colors = React.useMemo(() => resolveThemeColors(themeColors), [themeColors]);
    const ui = React.useMemo(() => deriveThemeUiColors(colors), [colors]);

    React.useEffect(() => {
        setAdminSessions(listStoredAdminSessions());
        setRespondentSessions(listStoredRespondentSessions());
    }, []);

    return (
        <div style={{ background: colors.page_background, color: colors.body_text, minHeight: '100vh' }}>
            <header
                style={{
                    backdropFilter: 'blur(14px)',
                    background: colors.panel_background,
                    borderBottom: `1px solid ${colors.panel_border}`,
                    left: 0,
                    position: 'fixed',
                    right: 0,
                    top: 0,
                    zIndex: 20,
                }}
            >
                <div
                    style={{
                        alignItems: 'center',
                        display: 'flex',
                        gap: '1rem',
                        justifyContent: 'space-between',
                        margin: '0 auto',
                        maxWidth: 1400,
                        padding: '1rem 1.5rem',
                    }}
                >
                    <div style={{ alignItems: 'center', display: 'flex', gap: '1rem', minWidth: 0 }}>
                        <button
                            onClick={() => setIsNavigationOpen(true)}
                            style={{
                                background: ui.info_background,
                                border: `1px solid ${ui.info_border}`,
                                borderRadius: 999,
                                color: colors.accent,
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                padding: '0.4rem 0.8rem',
                                whiteSpace: 'nowrap',
                            }}
                            type="button"
                        >
                            ≡ Sessions
                        </button>
                        <div style={{ color: colors.heading_text, fontFamily: 'Georgia, Times New Roman, serif', fontSize: '1.4rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            Mr. Kwiz
                        </div>
                        <div style={{ color: colors.body_text, minWidth: 0 }}>
                            <div style={{ fontSize: '0.98rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {metadata?.title ?? 'Loading quiz...'}
                            </div>
                            <div style={{ fontSize: '0.82rem', opacity: 0.82 }}>
                                {metadata
                                    ? `Definition version ${metadata.current_definition_version}`
                                    : 'Loading metadata...'}
                            </div>
                        </div>
                    </div>

                    <nav aria-label="Admin pages" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', justifyContent: 'flex-end' }}>
                        {adminKey
                            ? navItems.map((item) => (
                                  <NavLink
                                      key={item.id}
                                      style={({ isActive }) => navLinkStyle(isActive, colors.accent, colors.accent_text, colors.panel_border)}
                                      to={item.path(adminKey)}
                                  >
                                      {item.label}
                                  </NavLink>
                              ))
                            : null}
                    </nav>
                </div>
            </header>

            <main style={{ margin: '0 auto', maxWidth: 1400, padding: '7rem 1.5rem 2rem' }}>{children}</main>

            {isNavigationOpen && (
                <SessionNavigationModal
                    adminSessions={adminSessions}
                    currentAdminToken={adminKey}
                    onClose={() => setIsNavigationOpen(false)}
                    respondentSessions={respondentSessions}
                />
            )}
        </div>
    );
};
