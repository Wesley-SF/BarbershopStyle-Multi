import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute";
import Admin from "./pages/Admin";
import AdminLogin from "./pages/AdminLogin";
import Home from "./pages/Home";

function App() {
  useEffect(() => {
    document.title = "Kallé Cortes";
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/kalle-cortes" replace />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route element={<ProtectedAdminRoute />}>
        <Route path="/admin" element={<Admin />} />
      </Route>
      <Route path="/:storeSlug" element={<Home />} />
    </Routes>
  );
}

export default App;
