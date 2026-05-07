import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import '@/App.css';
import LandingPage from '@/pages/LandingPage';
import HomePage from '@/pages/HomePage';
import LearnIndexPage from '@/pages/learn/LearnIndexPage';
import LearnArticlePage from '@/pages/learn/LearnArticlePage';
import AboutSwuMarketing from '@/pages/AboutSwuMarketing';
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
import ConjointAnalysisTool from '@/pages/ConjointAnalysisTool';
import ConjointQualitativePage from '@/pages/ConjointQualitativePage';
import ConjointDesignPage from '@/pages/ConjointDesignPage';
import ConjointSurveyPage from '@/pages/ConjointSurveyPage';
import ConjointResultsPage from '@/pages/ConjointResultsPage';
import JournalFinder from '@/pages/JournalFinder';
import AcademicFormatEditor from '@/pages/AcademicFormatEditor';
import AdminSettings from '@/pages/AdminSettings';
import CourseSubmissions from '@/pages/CourseSubmissions';
import SurveyListPage from '@/pages/SurveyListPage';
import SurveyBuilderPage from '@/pages/SurveyBuilderPage';
import SurveyTakingPage from '@/pages/SurveyTakingPage';
import SurveyResponsesPage from '@/pages/SurveyResponsesPage';
import NotificationSettings from '@/pages/NotificationSettings';
import AdminNotifications from '@/pages/AdminNotifications';
import AdminUserManagement from '@/pages/AdminUserManagement';
import AdminLLMPrompts from '@/pages/AdminLLMPrompts';
import CmsListPage from '@/pages/cms/CmsListPage';
import CmsEditorPage from '@/pages/cms/CmsEditorPage';
import CmsPromptsPage from '@/pages/cms/CmsPromptsPage';
import CmsLandingPage from '@/pages/cms/CmsLandingPage';
import ProjectsPage from '@/pages/ProjectsPage';
import KanbanBoard from '@/pages/KanbanBoard';
import AlumniLandingPage from '@/pages/alumni/AlumniLandingPage';
import AlumniOnboardingPage from '@/pages/alumni/AlumniOnboardingPage';
import AlumniTreePage from '@/pages/alumni/AlumniTreePage';
import AlumniProfilePage from '@/pages/alumni/AlumniProfilePage';
import AlumniTriviaPage from '@/pages/alumni/AlumniTriviaPage';
import AlumniInviteAcceptPage from '@/pages/alumni/AlumniInviteAcceptPage';
import AlumniDiscoverPage from '@/pages/alumni/AlumniDiscoverPage';
import AlumniFeedPage from '@/pages/alumni/AlumniFeedPage';
import AlumniJobsPage from '@/pages/alumni/AlumniJobsPage';
import BrandEquityListPage from '@/pages/brand-equity/BrandEquityListPage';
import BrandEquityWizardPage from '@/pages/brand-equity/BrandEquityWizardPage';
import BrandEquityRespondentPage from '@/pages/brand-equity/BrandEquityRespondentPage';
import BrandEquityDashboardPage from '@/pages/brand-equity/BrandEquityDashboardPage';
import BrandEquityShowcaseIndexPage from '@/pages/brand-equity/BrandEquityShowcaseIndexPage';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Toaster } from '@/components/ui/sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// ============ AXIOS GLOBAL CONFIGURATION ============
// Set default timeout for all requests (30 seconds)
axios.defaults.timeout = 30000;

// Request interceptor - add timestamp for debugging
axios.interceptors.request.use(
  (config) => {
    config.metadata = { startTime: new Date() };
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors globally
axios.interceptors.response.use(
  (response) => {
    // Log slow requests (> 5 seconds)
    const duration = new Date() - response.config.metadata?.startTime;
    if (duration > 5000) {
      console.warn(`Slow request: ${response.config.url} took ${duration}ms`);
    }
    return response;
  },
  (error) => {
    // Handle specific error cases
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      console.error('Request timeout:', error.config?.url);
      error.message = 'การเชื่อมต่อหมดเวลา กรุณาลองใหม่อีกครั้ง';
    } else if (error.response?.status === 401) {
      // Token expired or invalid
      const token = localStorage.getItem('token');
      if (token && !error.config?.url?.includes('/auth/')) {
        console.warn('Session expired, logging out...');
        localStorage.removeItem('token');
        // Redirect to login if not already there
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login?session_expired=true';
        }
      }
    } else if (error.response?.status === 503) {
      error.message = 'เซิร์ฟเวอร์ไม่พร้อมให้บริการ กรุณาลองใหม่ในภายหลัง';
    } else if (!error.response) {
      // Network error
      error.message = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต';
    }
    
    return Promise.reject(error);
  }
);

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
            <Route path="/" element={<HomePage />} />
            <Route path="/legacy-home" element={<LandingPage />} />
            <Route path="/learn" element={<LearnIndexPage />} />
            <Route path="/learn/:slug" element={<LearnArticlePage />} />
            <Route path="/about/swu-marketing" element={<AboutSwuMarketing />} />
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
              path="/market-research/conjoint-analysis"
              element={
                <ProtectedRoute>
                  <ConjointAnalysisTool />
                </ProtectedRoute>
              }
            />
            <Route
              path="/research/conjoint/:studyId/qualitative"
              element={
                <ProtectedRoute>
                  <ConjointQualitativePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/research/conjoint/:studyId/design"
              element={
                <ProtectedRoute>
                  <ConjointDesignPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/research/conjoint/:studyId/results"
              element={
                <ProtectedRoute>
                  <ConjointResultsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/market-research/conjoint-analysis/:studyId/results"
              element={
                <ProtectedRoute>
                  <ConjointResultsPage />
                </ProtectedRoute>
              }
            />
            {/* Public Conjoint Results - No authentication required */}
            <Route
              path="/conjoint/results/:studyId"
              element={<ConjointResultsPage />}
            />

            <Route
              path="/survey/conjoint/:studyId"
              element={<ConjointSurveyPage />}
            />
            <Route
              path="/market-research/journal-finder"
              element={
                <ProtectedRoute>
                  <JournalFinder />
                </ProtectedRoute>
              }
            />
            <Route
              path="/market-research/academic-format-editor"
              element={
                <ProtectedRoute>
                  <AcademicFormatEditor />
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
              path="/courses/:courseId/submissions"
              element={
                <ProtectedRoute>
                  <CourseSubmissions />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/notifications"
              element={
                <ProtectedRoute>
                  <AdminNotifications />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute>
                  <AdminUserManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/llm-prompts"
              element={
                <ProtectedRoute>
                  <AdminLLMPrompts />
                </ProtectedRoute>
              }
            />
            <Route path="/admin/cms" element={<ProtectedRoute><CmsListPage /></ProtectedRoute>} />
            <Route path="/admin/cms/landing" element={<ProtectedRoute><CmsLandingPage /></ProtectedRoute>} />
            <Route path="/admin/cms/prompts" element={<ProtectedRoute><CmsPromptsPage /></ProtectedRoute>} />
            <Route path="/admin/cms/new" element={<ProtectedRoute><CmsEditorPage /></ProtectedRoute>} />
            <Route path="/admin/cms/:id" element={<ProtectedRoute><CmsEditorPage /></ProtectedRoute>} />
            <Route
              path="/profile/notifications"
              element={
                <ProtectedRoute>
                  <NotificationSettings />
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
            
            {/* Project Management Routes */}
            <Route
              path="/projects"
              element={
                <ProtectedRoute>
                  <ProjectsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId"
              element={
                <ProtectedRoute>
                  <KanbanBoard />
                </ProtectedRoute>
              }
            />

            {/* Alumni Network — สายตระกูล MKT SWU */}
            <Route path="/alumni" element={<AlumniLandingPage />} />
            <Route path="/alumni/invite/:code" element={<AlumniInviteAcceptPage />} />
            <Route
              path="/alumni/onboarding"
              element={
                <ProtectedRoute>
                  <AlumniOnboardingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/alumni/tree"
              element={
                <ProtectedRoute>
                  <AlumniTreePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/alumni/tree/:userId"
              element={
                <ProtectedRoute>
                  <AlumniTreePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/alumni/trivia"
              element={
                <ProtectedRoute>
                  <AlumniTriviaPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/alumni/discover"
              element={
                <ProtectedRoute>
                  <AlumniDiscoverPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/alumni/feed"
              element={
                <ProtectedRoute>
                  <AlumniFeedPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/alumni/jobs"
              element={
                <ProtectedRoute>
                  <AlumniJobsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/alumni/profile"
              element={
                <ProtectedRoute>
                  <AlumniProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/alumni/profile/:userId"
              element={
                <ProtectedRoute>
                  <AlumniProfilePage />
                </ProtectedRoute>
              }
            />
            {/* Brand Equity Module */}
            <Route
              path="/brand-equity"
              element={
                <ProtectedRoute>
                  <BrandEquityListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/brand-equity/new"
              element={
                <ProtectedRoute>
                  <BrandEquityWizardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/brand-equity/studies/:studyId/edit"
              element={
                <ProtectedRoute>
                  <BrandEquityWizardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/brand-equity/studies/:studyId"
              element={
                <ProtectedRoute>
                  <BrandEquityDashboardPage />
                </ProtectedRoute>
              }
            />
            {/* Public respondent — no auth */}
            <Route
              path="/brand-equity/respond/:token"
              element={<BrandEquityRespondentPage />}
            />
            {/* Public showcase index — no auth */}
            <Route
              path="/showcase"
              element={<BrandEquityShowcaseIndexPage />}
            />
            {/* Public showcase — read-only dashboard, no auth */}
            <Route
              path="/showcase/:token"
              element={<BrandEquityDashboardPage />}
            />
          </Routes>
          <Toaster position="top-right" richColors />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;