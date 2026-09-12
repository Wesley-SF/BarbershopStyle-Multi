import { useEffect } from "react";
import { Route, Routes, useParams } from "react-router-dom";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute";
import Admin from "./pages/Admin";
import AdminLogin from "./pages/AdminLogin";
import Home from "./pages/Home";
import Landing from "./pages/Landing";

function StoreHomeRoute() {
  const { storeSlug } = useParams();

  return <Home key={storeSlug} />;
}

function App() {
  useEffect(() => {
    document.title = "BarbershopStyle";
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/admin">
        <Route path="login" element={<AdminLogin />} />
        <Route element={<ProtectedAdminRoute />}>
          <Route index element={<Admin />} />
        </Route>
      </Route>
      <Route path="/:storeSlug" element={<StoreHomeRoute />} />
    </Routes>
  );
}

export default App;
