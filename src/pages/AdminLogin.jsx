import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setLoginError("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        console.error("Erro no login administrativo:", error);
        setLoginError("E-mail ou senha inválidos.");
        return;
      }

      navigate("/admin", { replace: true });
    } catch (error) {
      console.error("Erro inesperado no login administrativo:", error);
      setLoginError("Não foi possível entrar. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="app-shell admin-login-shell">
      <header className="site-header">
        <Link className="brand notranslate" to="/" translate="no">
          <span className="brand-mark" aria-hidden="true">B</span>
          <span>BarbershopStyle</span>
        </Link>
      </header>

      <main className="admin-login-page">
        <section className="admin-login-card" aria-labelledby="admin-login-title">
          <p className="eyebrow">Área administrativa</p>
          <h1 id="admin-login-title">Acessar painel</h1>
          <p className="intro-text">Entre com as credenciais do administrador.</p>

          <form className="admin-login-form" onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="admin-email">E-mail</label>
              <input
                id="admin-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="admin-password">Senha</label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            {loginError && (
              <p className="admin-login-error" role="alert">
                {loginError}
              </p>
            )}

            <button className="button button--primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

export default AdminLogin;
