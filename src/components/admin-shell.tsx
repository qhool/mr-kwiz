import React from 'react';
import { NavLink } from 'react-router-dom';

import type { AdminQuizMetadata } from '../hooks/useAdminQuizDefinition';

type AdminPage = 'edit' | 'preview' | 'invitations';

type AdminShellProps = {
    adminKey?: string;
    children: React.ReactNode;
    currentPage: AdminPage;
    metadata: AdminQuizMetadata | null;
};

const navItems: Array<{ id: AdminPage; label: string; path: (adminKey: string) => string }> = [
    { id: 'edit', label: 'Edit', path: (adminKey) => `/admin/${encodeURIComponent(adminKey)}/edit` },
    { id: 'preview', label: 'Preview', path: (adminKey) => `/admin/${encodeURIComponent(adminKey)}/preview` },
    { id: 'invitations', label: 'Invitations', path: (adminKey) => `/admin/${encodeURIComponent(adminKey)}/invitations` },
];

const navLinkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
    background: isActive ? '#6a5032' : 'rgba(255, 250, 240, 0.12)',
    border: isActive ? '1px solid #6a5032' : '1px solid rgba(246, 240, 223, 0.22)',
    borderRadius: 999,
    color: '#f6f0df',
    display: 'inline-flex',
    padding: '0.55rem 1rem',
    textDecoration: 'none',
});

export const AdminShell: React.FC<AdminShellProps> = ({ adminKey, children, currentPage, metadata }) => {
    return (
        <div style={{ minHeight: '100vh' }}>
            <header
                style={{
                    backdropFilter: 'blur(14px)',
                    background: 'rgba(44, 31, 16, 0.94)',
                    borderBottom: '1px solid rgba(200, 191, 169, 0.45)',
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
                        <div style={{ color: '#f6f0df', fontFamily: 'Georgia, Times New Roman, serif', fontSize: '1.4rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            Mr. Kwiz
                        </div>
                        <div style={{ color: '#e8dcc2', minWidth: 0 }}>
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
                                      style={navLinkStyle}
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
        </div>
    );
};