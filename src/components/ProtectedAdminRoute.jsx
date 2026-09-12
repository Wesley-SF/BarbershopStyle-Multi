import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

function ProtectedAdminRoute() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [accessError, setAccessError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const profileRequestVersionRef = useRef(0);
  const location = useLocation();

  useEffect(() => {
    let isCancelled = false;
    const pendingTimers = new Set();

    const loadProfile = async (nextSession, requestVersion) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, store_id, role")
        .eq("user_id", nextSession.user.id)
        .maybeSingle();

      if (
        isCancelled ||
        requestVersion !== profileRequestVersionRef.current
      ) {
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

    const beginSessionTransition = (nextSession) => {
      const requestVersion = ++profileRequestVersionRef.current;

      setSession(nextSession);
      setProfile(null);
      setAccessError("");

      if (!nextSession?.user) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const timerId = window.setTimeout(() => {
        pendingTimers.delete(timerId);
        if (!isCancelled) void loadProfile(nextSession, requestVersion);
      }, 0);
      pendingTimers.add(timerId);
    };

    const loadSession = async () => {
      const initialRequestVersion = profileRequestVersionRef.current;
      const { data, error } = await supabase.auth.getSession();

      if (
        isCancelled ||
        initialRequestVersion !== profileRequestVersionRef.current
      ) return;

      if (error) {
        console.error("Erro ao verificar sessão administrativa:", error);
      }

      beginSessionTransition(data.session);
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isCancelled) {
        beginSessionTransition(nextSession);
      }
    });

    return () => {
      isCancelled = true;
      profileRequestVersionRef.current += 1;
      pendingTimers.forEach((timerId) => window.clearTimeout(timerId));
      pendingTimers.clear();
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

  return (
    <Outlet
      key={profile.store_id}
      context={{ profile, storeId: profile.store_id }}
    />
  );
}

export default ProtectedAdminRoute;
