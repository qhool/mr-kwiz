import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import HomePage from './pages/index';
import QuizEditPage from './pages/admin/QuizEdit';
import QuizInvitationsPage from './pages/admin/QuizInvitations';
import QuizPreviewPage from './pages/admin/QuizPreview';
import InvitationPickupPage from './pages/respondent/InvitationPickup';
import QuizSessionPage from './pages/respondent/QuizSession';
import ViewResultsPage from './pages/respondent/ViewResults';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin/:adminKey/edit" element={<QuizEditPage />} />
        <Route path="/admin/:adminKey/invitations" element={<QuizInvitationsPage />} />
        <Route path="/admin/:adminKey/preview" element={<QuizPreviewPage />} />
        <Route path="/invite/:invitationKey" element={<InvitationPickupPage />} />
        <Route path="/quiz/:responseKey" element={<QuizSessionPage />} />
        <Route path="/view/:viewKey" element={<ViewResultsPage />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;