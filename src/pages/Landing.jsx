import { useEffect } from "react";
import { Link } from "react-router-dom";
import Brand from "../components/Brand";

function Landing() {
  useEffect(() => {
    document.title = "BarbershopStyle";
  }, []);

  return (
    <div className="app-shell landing-shell">
      <main className="landing-page">
        <Brand variant="landing" displayName="BarbershopStyle" />
        <div>
          <p className="eyebrow">BarbershopStyle</p>
          <h1>Sistema de agendamento para barbearias</h1>
          <p className="intro-text">
            Organize sua agenda e ofereça agendamentos online aos seus clientes.
          </p>
        </div>
        <Link className="button button--primary landing-admin-link" to="/admin">
          Acesso administrativo
        </Link>
      </main>
    </div>
  );
}

export default Landing;
