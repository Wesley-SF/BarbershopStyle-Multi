import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

function PublicBookingHeader({ logoUrl, onThemeToggle, storeName, theme }) {
  const [hasAuthenticatedUser, setHasAuthenticatedUser] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (isCancelled) return;

      if (error) {
        console.error("Erro ao verificar sessão na página pública:", error);
        setHasAuthenticatedUser(false);
        return;
      }

      setHasAuthenticatedUser(Boolean(data?.session?.user));
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isCancelled) setHasAuthenticatedUser(Boolean(session?.user));
    });

    return () => {
      isCancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="booking-hero">
      <div className="booking-topbar">
        <span className="booking-product notranslate" translate="no">BarbershopStyle</span>
        <div className="booking-topbar-actions">
          <button className="booking-theme-toggle" type="button" onClick={onThemeToggle} aria-label={`Ativar tema ${theme === "dark" ? "claro" : "escuro"}`}>
            <span aria-hidden="true">{theme === "dark" ? "☀" : "●"}</span>
            <span>{theme === "dark" ? "Claro" : "Escuro"}</span>
          </button>
          {hasAuthenticatedUser && (
            <Link className="booking-admin-link" to="/admin">
              <span className="booking-admin-label booking-admin-label--desktop">Painel administrativo</span>
              <span className="booking-admin-label booking-admin-label--mobile">← Painel</span>
            </Link>
          )}
        </div>
      </div>
      <div className="booking-hero-content">
        {logoUrl && <img className="booking-store-logo" src={logoUrl} alt={`Logo ${storeName}`} />}
        <div>
          <p>Barbearia</p>
          <h1>{storeName}</h1>
          <span>Agende seu horário de forma simples e rápida.</span>
        </div>
      </div>
    </header>
  );
}

export default PublicBookingHeader;
