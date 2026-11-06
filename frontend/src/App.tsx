import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { Spinner } from "./components/ui";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { LanguagesProvider } from "./hooks/useLanguages";
import { BeneficiariesPage } from "./pages/Beneficiaries";
import { BeneficiaryDetailPage } from "./pages/BeneficiaryDetail";
import { BriefingPage } from "./pages/Briefing";
import { CallScreen } from "./pages/CallScreen";
import { DashboardPage } from "./pages/Dashboard";
import { LoginPage } from "./pages/Login";
import { NotFoundPage } from "./pages/NotFound";
import { PhoneCallPage } from "./pages/PhoneCall";
import { VoiceNotePage } from "./pages/VoiceNote";

function SignedInRoutes() {
  const { me, checking } = useAuth();
  if (checking)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-6 text-brand-700" />
      </div>
    );
  if (!me) return <LoginPage />;
  return (
    // key: a different ASHA gets a fresh tree, so no page shows the previous account's data
    <Routes key={me.id}>
      {/* Full-screen call, outside the app chrome */}
      <Route path="/call/:callId" element={<CallScreen />} />
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="women" element={<BeneficiariesPage />} />
        <Route path="women/:id" element={<BeneficiaryDetailPage />} />
        <Route path="phone-call/:callId" element={<PhoneCallPage />} />
        <Route path="note" element={<VoiceNotePage />} />
        <Route path="briefing" element={<BriefingPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <LanguagesProvider>
        <AuthProvider>
          <BrowserRouter>
            <SignedInRoutes />
          </BrowserRouter>
        </AuthProvider>
      </LanguagesProvider>
    </ToastProvider>
  );
}
