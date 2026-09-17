const menuItems = [
  { id: "agenda", label: "Agendamentos", icon: "A" },
  { id: "completed", label: "Concluídos", icon: "C" },
  { id: "cancelled", label: "Cancelados", icon: "X" },
  { id: "blocks", label: "Bloqueios", icon: "B" },
  { id: "services", label: "Serviços", icon: "S" },
  { id: "settings", label: "Configurações", icon: "⚙" },
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
              <span className="admin-navigation-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}

export default AdminSidebar;
