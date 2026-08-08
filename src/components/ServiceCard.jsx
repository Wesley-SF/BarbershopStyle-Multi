import Button from "./Button";

function ServiceCard({
  nome,
  duracao,
  isSelected,
  isDisabled = false,
  disabledReason = "",
  onSelect,
}) {
  return (
    <article
      className={`service-card${isSelected ? " service-card--selected" : ""}${isDisabled ? " service-card--disabled" : ""}`}
      aria-disabled={isDisabled || undefined}
    >
      <div>
        <p className="service-duration">Duração: {duracao}</p>
        <h2>{nome}</h2>
        {isDisabled && <p className="service-included-note">{disabledReason}</p>}
      </div>
      <Button
        texto={isDisabled ? "Já incluído" : isSelected ? "Selecionado" : "Selecionar"}
        onClick={onSelect}
        disabled={isDisabled}
        ariaPressed={isSelected}
        variant="outline"
      />
    </article>
  );
}

export default ServiceCard;
