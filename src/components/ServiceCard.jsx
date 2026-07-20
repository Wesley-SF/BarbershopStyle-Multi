import Button from "./Button";

function ServiceCard({ nome, duracao, isSelected, onSelect }) {
  return (
    <article className={`service-card${isSelected ? " service-card--selected" : ""}`}>
      <div>
        <p className="service-duration">Duração: {duracao}</p>
        <h2>{nome}</h2>
      </div>
      <Button
        texto={isSelected ? "Selecionado" : "Selecionar"}
        onClick={onSelect}
        ariaPressed={isSelected}
        variant="outline"
      />
    </article>
  );
}

export default ServiceCard;
