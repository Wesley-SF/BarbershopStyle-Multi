import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

function ProtectedAdminRoute() {
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    let isCancelled = false;

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (isCancelled) {
        return;
      }

      if (error) {
        console.error("Erro ao verificar sessão administrativa:", error);
      }

      setSession(data.session);
      setIsLoading(false);
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isCancelled) {
        setSession(nextSession);
        setIsLoading(false);
      }
    });

    return () => {
      isCancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (isLoading) {
    return (
      <div className="auth-loading" role="status">
        Carregando...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

export default ProtectedAdminRoute;
