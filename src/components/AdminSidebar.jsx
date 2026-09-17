function MenuIcon({ name }) {
  const paths = {
    calendar: <><path d="M8 2v4M16 2v4M3 10h18" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></>,
    completed: <><path d="M8 2v4M16 2v4M3 10h18" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="m9 16 2 2 4-4" /></>,
    cancelled: <><path d="M8 2v4M16 2v4M3 10h18" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="m10 15 4 4m0-4-4 4" /></>,
    blocks: <><path d="M8 2v4M16 2v4M3 10h8M3 10v8a2 2 0 0 0 2 2h6" /><path d="M18 14v4l2 1" /><circle cx="18" cy="18" r="4" /><path d="M5 4h14a2 2 0 0 1 2 2v5" /></>,
    services: <><circle cx="6" cy="7" r="3" /><path d="m8.7 8.4 11.8 6.6M8.7 15.6 20.5 9" /><circle cx="6" cy="17" r="3" /></>,
    settings: <><path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.2a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.8v.5a2 2 0 0 1-1 1.8l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.2a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.2a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.8v-.5a2 2 0 0 1 1-1.8l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.2a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2Z" /><circle cx="12" cy="12" r="3" /></>,
  };

  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const menuItems = [
  { id: "agenda", label: "Agendamentos", icon: "calendar" },
  { id: "completed", label: "Concluídos", icon: "completed" },
  { id: "cancelled", label: "Cancelados", icon: "cancelled" },
  { id: "blocks", label: "Horários e Bloqueios", icon: "blocks" },
  { id: "services", label: "Serviços", icon: "services" },
  { id: "settings", label: "Configurações", icon: "settings" },
];

function AdminSidebar({ activeTab, isOpen, onClose, onSelect, storeName }) {
  const selectTab = (tabId) => {
    onSelect(tabId);
    onClose();
  };

  return (
    <>
      <button
        className={`admin-drawer-backdrop${isOpen ? " admin-drawer-backdrop--visible" : ""}`}
        type="button"
        aria-label="Fechar menu"
        tabIndex={isOpen ? 0 : -1}
        onClick={onClose}
      />
      <aside className={`admin-sidebar${isOpen ? " admin-sidebar--open" : ""}`} aria-label="Navegação administrativa">
        <div className="admin-product">
          <strong className="notranslate" translate="no">BarbershopStyle</strong>
          <span>Sistema de Gestão para Barbearias</span>
        </div>

        <div className="admin-store-identity">
          <span>Barbearia</span>
          <strong>{storeName || "Carregando..."}</strong>
        </div>

        <nav className="admin-navigation" aria-label="Seções do painel">
          {menuItems.map((item) => (
            <button
              className={`admin-navigation-item${activeTab === item.id ? " admin-navigation-item--active" : ""}`}
              type="button"
              key={item.id}
              aria-current={activeTab === item.id ? "page" : undefined}
              onClick={() => selectTab(item.id)}
            >
              <span className="admin-navigation-icon"><MenuIcon name={item.icon} /></span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}

export default AdminSidebar;
