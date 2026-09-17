import { Link } from "react-router-dom";

function PublicBookingHeader({ logoUrl, onThemeToggle, storeName, theme }) {
  return (
    <header className="booking-hero">
      <div className="booking-topbar">
        <span className="booking-product notranslate" translate="no">BarbershopStyle</span>
        <div className="booking-topbar-actions">
          <button className="booking-theme-toggle" type="button" onClick={onThemeToggle} aria-label={`Ativar tema ${theme === "dark" ? "claro" : "escuro"}`}>
            <span aria-hidden="true">{theme === "dark" ? "☀" : "●"}</span>
            <span>{theme === "dark" ? "Claro" : "Escuro"}</span>
          </button>
          <Link className="booking-admin-link" to="/admin">Painel administrativo</Link>
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
