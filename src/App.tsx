import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import HomePage from './pages/index';
import QuizEditPage from './pages/admin/QuizEdit';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin/:adminKey/edit" element={<QuizEditPage />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;