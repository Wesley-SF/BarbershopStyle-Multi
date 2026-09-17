const cards = [
  { key: "pending", label: "Pendentes" },
  { key: "completed", label: "Concluídos" },
  { key: "cancelled", label: "Cancelados" },
  { key: "blocks", label: "Bloqueios" },
];

function AdminSummaryCards({ counts }) {
  return (
    <section className="admin-summary-grid" aria-label="Resumo do painel">
      {cards.map((card) => (
        <article className={`admin-summary-card admin-summary-card--${card.key}`} key={card.key}>
          <span>{card.label}</span>
          <strong>{counts[card.key]}</strong>
          <i aria-hidden="true" />
        </article>
      ))}
    </section>
  );
}

export default AdminSummaryCards;
