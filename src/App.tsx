import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';

const HomePage = React.lazy(() => import('./pages/index'));
const QuizEditPage = React.lazy(() => import('./pages/admin/QuizEdit'));
const QuizInvitationsPage = React.lazy(() => import('./pages/admin/QuizInvitations'));
const QuizPreviewPage = React.lazy(() => import('./pages/admin/QuizPreview'));
const InvitationPickupPage = React.lazy(() => import('./pages/respondent/InvitationPickup'));
const QuizSessionPage = React.lazy(() => import('./pages/respondent/QuizSession'));
const ViewResultsPage = React.lazy(() => import('./pages/respondent/ViewResults'));

const AdminAiRedirect: React.FC = () => {
  const { adminKey } = useParams<{ adminKey: string }>();
  return <Navigate replace to={`/admin/${encodeURIComponent(adminKey ?? '')}/edit`} />;
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <React.Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin/:adminKey/edit" element={<QuizEditPage />} />
          <Route path="/admin/:adminKey/ai" element={<AdminAiRedirect />} />
          <Route path="/admin/:adminKey/invitations" element={<QuizInvitationsPage />} />
          <Route path="/admin/:adminKey/preview" element={<QuizPreviewPage />} />
          <Route path="/invite/:invitationKey" element={<InvitationPickupPage />} />
          <Route path="/quiz/:responseKey" element={<QuizSessionPage />} />
          <Route path="/view/:viewKey" element={<ViewResultsPage />} />
        </Routes>
      </React.Suspense>
    </BrowserRouter>
  );
};

export default App;
