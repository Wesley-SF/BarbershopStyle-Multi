import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

function ProtectedAdminRoute() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [accessError, setAccessError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    let isCancelled = false;

    const loadProfile = async (nextSession) => {
      if (!nextSession?.user) {
        setSession(null);
        setProfile(null);
        setAccessError("");
        setIsLoading(false);
        return;
      }

      setSession(nextSession);
      setIsLoading(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, store_id, role")
        .eq("user_id", nextSession.user.id)
        .maybeSingle();

      if (isCancelled) {
        return;
      }

      if (error) {
        console.error("Erro ao verificar perfil administrativo:", error);
        setProfile(null);
        setAccessError("Não foi possível validar o acesso administrativo.");
      } else if (!data || data.role !== "admin") {
        setProfile(null);
        setAccessError("Esta conta não possui um perfil administrativo.");
      } else {
        setProfile(data);
        setAccessError("");
      }

      setIsLoading(false);
    };

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (isCancelled) return;

      if (error) {
        console.error("Erro ao verificar sessão administrativa:", error);
      }

      await loadProfile(data.session);
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isCancelled) {
        window.setTimeout(() => {
          if (!isCancelled) void loadProfile(nextSession);
        }, 0);
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

  if (!profile) {
    return (
      <div className="auth-loading" role="alert">
        {accessError || "Acesso administrativo não autorizado."}
      </div>
    );
  }

  return <Outlet context={{ profile, storeId: profile.store_id }} />;
}

export default ProtectedAdminRoute;
