import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import HomePage from './pages/index';
import QuizEditPage from './pages/admin/QuizEdit';
import QuizInvitationsPage from './pages/admin/QuizInvitations';
import QuizPreviewPage from './pages/admin/QuizPreview';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin/:adminKey/edit" element={<QuizEditPage />} />
        <Route path="/admin/:adminKey/invitations" element={<QuizInvitationsPage />} />
        <Route path="/admin/:adminKey/preview" element={<QuizPreviewPage />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;