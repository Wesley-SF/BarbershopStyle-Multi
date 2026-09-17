const steps = [
  { id: "service", label: "Serviços" },
  { id: "date", label: "Data" },
  { id: "time", label: "Horário" },
  { id: "customer", label: "Seus dados" },
  { id: "confirmation", label: "Confirmação" },
];

function BookingProgress({ currentStep }) {
  const currentIndex = steps.findIndex((step) => step.id === currentStep);

  return (
    <nav className="booking-progress" aria-label="Etapas do agendamento">
      <ol>
        {steps.map((step, index) => {
          const state = index < currentIndex ? "complete" : index === currentIndex ? "active" : "future";
          return (
            <li className={`booking-progress-step booking-progress-step--${state}`} key={step.id} aria-current={state === "active" ? "step" : undefined}>
              <span className="booking-progress-number" aria-hidden="true">{state === "complete" ? "✓" : index + 1}</span>
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default BookingProgress;
