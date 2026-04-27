import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

// Public pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import OnboardingPage from './pages/OnboardingPage';
import InvitePage from './pages/InvitePage';

// Dashboard pages (require auth)
import HomePage from './pages/HomePage';
import QueryPage from './pages/QueryPage';
import HistoryPage from './pages/HistoryPage';
import ResultPage from './pages/ResultPage';
import SettingsPage from './pages/SettingsPage';
import TeamPage from './pages/TeamPage';
import BudgetPage from './pages/BudgetPage';

// Admin pages (require platform_admin)
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminOrgs from './pages/admin/AdminOrgs';
import AdminUsers from './pages/admin/AdminUsers';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ── Public Routes ── */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/register" element={<SignupPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />

          {/* ── Onboarding (auth required, no sidebar) ── */}
          <Route path="/onboarding" element={
            <ProtectedRoute requiredRoles={['org_admin', 'platform_admin']}>
              <OnboardingPage />
            </ProtectedRoute>
          } />

          {/* ── Dashboard (auth required, sidebar layout) ── */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<HomePage />} />
            <Route path="query" element={<QueryPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="results/:id" element={<ResultPage />} />
            <Route path="settings" element={
              <ProtectedRoute requiredRoles={['org_admin', 'platform_admin']}>
                <SettingsPage />
              </ProtectedRoute>
            } />
            <Route path="team" element={
              <ProtectedRoute requiredRoles={['org_admin', 'platform_admin']}>
                <TeamPage />
              </ProtectedRoute>
            } />
            <Route path="budget" element={<BudgetPage />} />
          </Route>

          {/* ── Admin (platform_admin only, sidebar layout) ── */}
          <Route path="/admin" element={
            <ProtectedRoute requiredRoles={['platform_admin']}>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<AdminDashboard />} />
            <Route path="orgs" element={<AdminOrgs />} />
            <Route path="users" element={<AdminUsers />} />
          </Route>

          {/* ── Legacy route redirects ── */}
          <Route path="/query" element={<Navigate to="/dashboard/query" replace />} />
          <Route path="/history" element={<Navigate to="/dashboard/history" replace />} />
          <Route path="/results/:id" element={<Navigate to="/dashboard/results/:id" replace />} />

          {/* ── Fallback ── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
