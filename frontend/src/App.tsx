import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import { LanguagesProvider } from "./hooks/useLanguages";
import { BeneficiariesPage } from "./pages/Beneficiaries";
import { BeneficiaryDetailPage } from "./pages/BeneficiaryDetail";
import { BriefingPage } from "./pages/Briefing";
import { CallScreen } from "./pages/CallScreen";
import { DashboardPage } from "./pages/Dashboard";
import { NotFoundPage } from "./pages/NotFound";
import { VoiceNotePage } from "./pages/VoiceNote";

export default function App() {
  return (
    <ToastProvider>
      <LanguagesProvider>
        <BrowserRouter>
          <Routes>
            {/* Full-screen call, outside the app chrome */}
            <Route path="/call/:callId" element={<CallScreen />} />
            <Route element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="women" element={<BeneficiariesPage />} />
              <Route path="women/:id" element={<BeneficiaryDetailPage />} />
              <Route path="note" element={<VoiceNotePage />} />
              <Route path="briefing" element={<BriefingPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </LanguagesProvider>
    </ToastProvider>
  );
}
