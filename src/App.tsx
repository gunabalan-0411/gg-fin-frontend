import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Layout from "@/components/layout/Layout";
import { SessionGuard } from "@/components/SessionGuard";
import LoginPage from "@/pages/LoginPage";
import SetupPage from "@/pages/SetupPage";
import DashboardPage from "@/pages/DashboardPage";
import CustomersPage from "@/pages/CustomersPage";
import CollectionsPage from "@/pages/CollectionsPage";
import ExpensesPage from "@/pages/ExpensesPage";
import DebtsPage from "@/pages/DebtsPage";
import VoicePage from "@/pages/VoicePage";
import SettingsPage from "@/pages/SettingsPage";
import NameMapPage from "@/pages/NameMapPage";
import UpiPage from "@/pages/UpiPage";
import OcrPage from "@/pages/OcrPage";
import SqlPage from "@/pages/SqlPage";
import OAuthCallbackPage from "@/pages/OAuthCallbackPage";
import { useAuthStore } from "@/hooks/useAuth";
import { setupApi } from "@/services/api";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const authenticated = useAuthStore((s) => s.authenticated);
  if (!authenticated) return <Navigate to="/login" replace />;
  return <SessionGuard>{children}</SessionGuard>;
}

export default function App() {
  const authenticated = useAuthStore((s) => s.authenticated);
  const [setupChecked, setSetupChecked] = useState(false);
  const [isFresh, setIsFresh] = useState(false);

  useEffect(() => {
    // Only show setup page if user is NOT already logged in
    if (authenticated) { setSetupChecked(true); return; }
    setupApi.status()
      .then(({ data }) => { setIsFresh(data.is_fresh); })
      .catch(() => { /* backend not ready yet — proceed normally */ })
      .finally(() => setSetupChecked(true));
  }, []);

  if (!setupChecked) {
    // Tiny loading state while we check — app won't flash
    return null;
  }

  if (isFresh) {
    return (
      <SetupPage onComplete={() => setIsFresh(false)} />
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/oauth-callback" element={<OAuthCallbackPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="transactions" element={<CollectionsPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="debts" element={<DebtsPage />} />
          <Route path="voice" element={<VoicePage />} />
          <Route path="ocr" element={<OcrPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="namemap" element={<NameMapPage />} />
          <Route path="upi" element={<UpiPage />} />
          <Route path="sql" element={<SqlPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
