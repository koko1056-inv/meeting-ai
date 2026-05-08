import { Routes, Route } from "react-router-dom";
import HostPage from "./pages/HostPage";
import GuestPage from "./pages/GuestPage";
import MinutesPreviewPage from "./pages/MinutesPreviewPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HostPage />} />
      <Route path="/guest/:sessionId" element={<GuestPage />} />
      <Route path="/minutes/:sessionId" element={<MinutesPreviewPage />} />
    </Routes>
  );
}
