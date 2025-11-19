import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import '@/App.css';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import Dashboard from '@/pages/Dashboard';
import ContentBrowse from '@/pages/ContentBrowse';
import ContentDetail from '@/pages/ContentDetail';
import ContentEditor from '@/pages/ContentEditor';
import ProfilePage from '@/pages/ProfilePage';
import MarketResearch from '@/pages/MarketResearch';
import CustomerJourneyTool from '@/pages/CustomerJourneyTool';
import CustomerBehaviorTool from '@/pages/CustomerBehaviorTool';
import CustomerPerceptionTool from '@/pages/CustomerPerceptionTool';
import JournalFinder from '@/pages/JournalFinder';
import AdminSettings from '@/pages/AdminSettings';
import SurveyListPage from '@/pages/SurveyListPage';
import SurveyBuilderPage from '@/pages/SurveyBuilderPage';
import SurveyTakingPage from '@/pages/SurveyTakingPage';
import SurveyResponsesPage from '@/pages/SurveyResponsesPage';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Toaster } from '@/components/ui/sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  return user ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="App">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/content" element={<ContentBrowse />} />
            <Route path="/content/:id" element={<ContentDetail />} />
            <Route path="/market-research" element={<MarketResearch />} />
            <Route
              path="/market-research/customer-journey"
              element={
                <ProtectedRoute>
                  <CustomerJourneyTool />
                </ProtectedRoute>
              }
            />
            <Route
              path="/market-research/customer-behavior"
              element={
                <ProtectedRoute>
                  <CustomerBehaviorTool />
                </ProtectedRoute>
              }
            />
            <Route
              path="/market-research/customer-perception"
              element={
                <ProtectedRoute>
                  <CustomerPerceptionTool />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <ProtectedRoute>
                  <AdminSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/content/create"
              element={
                <ProtectedRoute>
                  <ContentEditor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/surveys"
              element={
                <ProtectedRoute>
                  <SurveyListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/surveys/create"
              element={
                <ProtectedRoute>
                  <SurveyBuilderPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/surveys/:surveyId/edit"
              element={
                <ProtectedRoute>
                  <SurveyBuilderPage />
                </ProtectedRoute>
              }
            />
            <Route path="/surveys/:surveyId/take" element={<SurveyTakingPage />} />
            <Route
              path="/surveys/:surveyId/responses"
              element={
                <ProtectedRoute>
                  <SurveyResponsesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/content/edit/:id"
              element={
                <ProtectedRoute>
                  <ContentEditor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
          </Routes>
          <Toaster position="top-right" richColors />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;