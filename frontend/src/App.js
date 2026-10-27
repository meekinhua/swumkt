import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import '@/App.css';

// ============ EAGER imports — small / critical for first paint ============
import HomePage from '@/pages/HomePage';
import LandingPage from '@/pages/LandingPage';
import LearnIndexPage from '@/pages/learn/LearnIndexPage';
import CmsArticleView from '@/pages/learn/CmsArticleView';
import AboutSwuMarketing from '@/pages/AboutSwuMarketing';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import ProfilePage from '@/pages/ProfilePage';
import Dashboard from '@/pages/Dashboard';
import MarketResearch from '@/pages/MarketResearch';
import UnifiedShowcasePage from '@/pages/UnifiedShowcasePage';
import AnnouncementsPage from '@/pages/AnnouncementsPage';
import BrandEquityListPage from '@/pages/brand-equity/BrandEquityListPage';
import BrandEquityRespondentPage from '@/pages/brand-equity/BrandEquityRespondentPage';
import BrandEquityShowcaseIndexPage from '@/pages/brand-equity/BrandEquityShowcaseIndexPage';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Toaster } from '@/components/ui/sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ============ LAZY imports — heavy / admin / rarely-used pages ============
// Heavy tool pages (>= 900 lines each)
// Faculty — public, crawlable profiles and the department's publications
const PeopleIndexPage = lazy(() => import('@/pages/people/PeopleIndexPage'));
const PeopleProfilePage = lazy(() => import('@/pages/people/PeopleProfilePage'));
const PublicationsPage = lazy(() => import('@/pages/people/PublicationsPage'));
const ConjointResultsPage = lazy(() => import('@/pages/ConjointResultsPage'));
const ConjointDesignPage = lazy(() => import('@/pages/ConjointDesignPage'));
const ConjointAnalysisTool = lazy(() => import('@/pages/ConjointAnalysisTool'));
const ConjointQualitativePage = lazy(() => import('@/pages/ConjointQualitativePage'));
const ConjointSurveyPage = lazy(() => import('@/pages/ConjointSurveyPage'));
const KanbanBoard = lazy(() => import('@/pages/KanbanBoard'));
const ContentEditor = lazy(() => import('@/pages/ContentEditor'));
const ContentBrowse = lazy(() => import('@/pages/ContentBrowse'));
const ContentDetail = lazy(() => import('@/pages/ContentDetail'));
const CustomerJourneyHub = lazy(() => import('@/pages/journey/CustomerJourneyHub'));
const JourneyWizardPage = lazy(() => import('@/pages/journey/JourneyWizardPage'));
const JourneyDashboardPage = lazy(() => import('@/pages/journey/JourneyDashboardPage'));
const JourneyRespondentPage = lazy(() => import('@/pages/journey/JourneyRespondentPage'));
const CustomerBehaviorTool = lazy(() => import('@/pages/CustomerBehaviorTool'));
const CustomerPerceptionTool = lazy(() => import('@/pages/CustomerPerceptionTool'));
const CustomerValueListPage = lazy(() => import('@/pages/customer-value/CustomerValueListPage'));
const CustomerValueStudioPage = lazy(() => import('@/pages/customer-value/CustomerValueStudioPage'));
const JournalFinder = lazy(() => import('@/pages/JournalFinder'));
const AcademicFormatEditor = lazy(() => import('@/pages/AcademicFormatEditor'));
const BrandEquityWizardPage = lazy(() => import('@/pages/brand-equity/BrandEquityWizardPage'));
const BrandEquityDashboardPage = lazy(() => import('@/pages/brand-equity/BrandEquityDashboardPage'));

// Surveys
const SurveyListPage = lazy(() => import('@/pages/SurveyListPage'));
const SurveyBuilderPage = lazy(() => import('@/pages/SurveyBuilderPage'));
const SurveyTakingPage = lazy(() => import('@/pages/SurveyTakingPage'));
const SurveyResponsesPage = lazy(() => import('@/pages/SurveyResponsesPage'));

// Admin pages (only admin sees, no need in initial bundle for guest/student)
const AdminSettings = lazy(() => import('@/pages/AdminSettings'));
const AdminNotifications = lazy(() => import('@/pages/AdminNotifications'));
const AdminUserManagement = lazy(() => import('@/pages/AdminUserManagement'));
const AdminLLMPrompts = lazy(() => import('@/pages/AdminLLMPrompts'));
const NotificationSettings = lazy(() => import('@/pages/NotificationSettings'));
const CourseSubmissions = lazy(() => import('@/pages/CourseSubmissions'));

// CMS pages (admin only)
const CmsListPage = lazy(() => import('@/pages/cms/CmsListPage'));
const CmsEditorPage = lazy(() => import('@/pages/cms/CmsEditorPage'));
const CmsPromptsPage = lazy(() => import('@/pages/cms/CmsPromptsPage'));
const CmsLandingPage = lazy(() => import('@/pages/cms/CmsLandingPage'));
const CmsSetupPage = lazy(() => import('@/pages/cms/CmsSetupPage'));

// Projects
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'));

// Alumni (paused module — perfect for lazy)
const AlumniLandingPage = lazy(() => import('@/pages/alumni/AlumniLandingPage'));
const AlumniOnboardingPage = lazy(() => import('@/pages/alumni/AlumniOnboardingPage'));
const AlumniTreePage = lazy(() => import('@/pages/alumni/AlumniTreePage'));
const AlumniProfilePage = lazy(() => import('@/pages/alumni/AlumniProfilePage'));
const AlumniTriviaPage = lazy(() => import('@/pages/alumni/AlumniTriviaPage'));
const AlumniInviteAcceptPage = lazy(() => import('@/pages/alumni/AlumniInviteAcceptPage'));
const AlumniDiscoverPage = lazy(() => import('@/pages/alumni/AlumniDiscoverPage'));
const AlumniFeedPage = lazy(() => import('@/pages/alumni/AlumniFeedPage'));
const AlumniJobsPage = lazy(() => import('@/pages/alumni/AlumniJobsPage'));

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// ============ AXIOS GLOBAL CONFIGURATION ============
// Set default timeout for all requests (30 seconds)
axios.defaults.timeout = 30000;

// LLM-backed and heavy statistical endpoints legitimately run 40-120s. With the
// 30s default the browser aborted while the backend was still working and the
// user saw "ไม่สามารถวิเคราะห์ข้อมูลได้" on a request that actually succeeded —
// exactly what happened to Conjoint Phase 1. Widen the window for those paths
// only, so a genuinely hung normal request still fails fast.
const SLOW_API_PATTERN = /\/(qualitative-analysis|statistical-analysis|ai-analysis|ai-analyze|ai-suggest|ai-needs|ai-step|ai-interpretation|interpretation|thesis|export-thesis|generate-image|generate-questions|regenerate-questions|compare|score-history|segment-significance|dashboard)/i;

// Request interceptor - add timestamp for debugging
axios.interceptors.request.use(
  (config) => {
    if (SLOW_API_PATTERN.test(config.url || '')) {
      config.timeout = 180000;
    }
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

// React Query — single shared client with sensible defaults for the app.
// Cache GETs for 60s, retry 1x, refetch on window focus only if data is stale.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,           // data considered fresh for 60s
      gcTime: 5 * 60_000,           // unused cache kept 5 min then GC
      retry: 1,                     // 1 retry on failure (not 3 — fail fast)
      // `true`, not `'always'`: refetch on focus only when the data is stale.
      // `'always'` ignores staleTime, so every alt-tab back to the page
      // re-ran all four homepage queries — 10.3 MB on production — however
      // recently they had been fetched. The comment here always said "IF
      // stale"; the value did not match it.
      refetchOnWindowFocus: true,
      refetchOnMount: true,
    },
  },
});

// Lazy-route fallback — minimal centred shim matching app aesthetic
const RouteFallback = () => (
  <div style={{
    minHeight: '60vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: 11,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#71717A',
  }} data-testid="route-fallback">
    <span style={{
      display: 'inline-block',
      width: 6, height: 6, borderRadius: 99,
      background: '#C8102E',
      marginRight: 8,
      animation: 'utb-pulse 1s ease-in-out infinite',
    }}/>
    Loading…
  </div>
);

// External redirect helper — sends the browser to a non-SPA backend path.
const ExternalRedirect = ({ to }) => {
  useEffect(() => { window.location.replace(to); }, [to]);
  return <RouteFallback />;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <div className="App">
            <Suspense fallback={<RouteFallback/>}>
              <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/meekintube" element={<ExternalRedirect to="/api/meekintube/" />} />
            <Route path="/legacy-home" element={<LandingPage />} />
            <Route path="/learn" element={<LearnIndexPage />} />
            <Route path="/learn/:slug" element={<CmsArticleView />} />
            <Route path="/about/swu-marketing" element={<AboutSwuMarketing />} />
            <Route path="/people" element={<PeopleIndexPage />} />
            <Route path="/people/:slug" element={<PeopleProfilePage />} />
            <Route path="/publications" element={<PublicationsPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/content" element={<ContentBrowse />} />
            <Route path="/content/:id" element={<ContentDetail />} />
            <Route path="/market-research" element={<MarketResearch />} />
            <Route
              path="/market-research/customer-journey"
              element={
                <ProtectedRoute>
                  <CustomerJourneyHub />
                </ProtectedRoute>
              }
            />
            <Route
              path="/market-research/customer-journey/quant/new"
              element={
                <ProtectedRoute>
                  <JourneyWizardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/market-research/customer-journey/quant/:studyId/wizard"
              element={
                <ProtectedRoute>
                  <JourneyWizardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/market-research/customer-journey/quant/:studyId"
              element={
                <ProtectedRoute>
                  <JourneyDashboardPage />
                </ProtectedRoute>
              }
            />
            {/* Public respondent link — no auth */}
            <Route path="/journey/r/:token" element={<JourneyRespondentPage />} />
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
            {/* Stale bookmarks / hand-typed URLs used to land on a blank page. */}
            <Route path="/conjoint" element={<Navigate to="/market-research/conjoint-analysis" replace />} />
            <Route
              path="/market-research/conjoint-analysis"
              element={
                <ProtectedRoute>
                  <ConjointAnalysisTool />
                </ProtectedRoute>
              }
            />
            <Route
              path="/market-research/customer-value"
              element={
                <ProtectedRoute>
                  <CustomerValueListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/market-research/customer-value/:studyId"
              element={
                <ProtectedRoute>
                  <CustomerValueStudioPage />
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
            <Route path="/admin/cms/setup" element={<ProtectedRoute><CmsSetupPage /></ProtectedRoute>} />
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
            {/* Public unified showcase (BE + Conjoint) — no auth */}
            <Route
              path="/showcase"
              element={<UnifiedShowcasePage />}
            />
            {/* Public announcements archive — no auth */}
            <Route
              path="/announcements"
              element={<AnnouncementsPage />}
            />
            {/* Legacy BE-only showcase index — kept for backward compat */}
            <Route
              path="/showcase/brand-equity"
              element={<BrandEquityShowcaseIndexPage />}
            />
            {/* Public showcase — read-only dashboard, no auth */}
            <Route
              path="/showcase/:token"
              element={<BrandEquityDashboardPage />}
            />
          </Routes>
          </Suspense>
          <Toaster position="top-right" richColors />
        </div>
      </BrowserRouter>
    </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;