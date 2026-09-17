import { Link } from "react-router-dom";

function AdminHeader({ bookingPath, isSigningOut, onLogout, onMenuOpen, onThemeToggle, theme }) {
  return (
    <header className="admin-dashboard-header">
      <div className="admin-dashboard-header-copy">
        <button className="admin-menu-button" type="button" aria-label="Abrir menu" onClick={onMenuOpen}>
          <span aria-hidden="true">☰</span>
        </button>
        <div>
          <strong>Bem-vindo de volta!</strong>
          <span>Tenha um ótimo dia de trabalho.</span>
        </div>
      </div>

      <div className="admin-dashboard-actions">
        <button className="admin-theme-toggle" type="button" onClick={onThemeToggle} aria-label={`Ativar tema ${theme === "dark" ? "claro" : "escuro"}`}>
          <span aria-hidden="true">{theme === "dark" ? "☀" : "●"}</span>
          <span>{theme === "dark" ? "Claro" : "Escuro"}</span>
        </button>
        <Link className="admin-new-booking" to={bookingPath}>Novo agendamento</Link>
        <div className="admin-user-chip" aria-label="Sessão do administrador">
          <span aria-hidden="true">AD</span>
          <strong>Administrador</strong>
        </div>
        <button className="admin-logout-button" type="button" disabled={isSigningOut} onClick={onLogout}>
          {isSigningOut ? "Saindo..." : "Sair"}
        </button>
      </div>
    </header>
  );
}

export default AdminHeader;
