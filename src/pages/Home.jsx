import { useEffect, useState } from "react";
import { DayPicker } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import "react-day-picker/style.css";
import Button from "../components/Button";
import ServiceCard from "../components/ServiceCard";
import { supabase } from "../lib/supabase";

function parseLocalDate(dateString) {
  if (!dateString) {
    return undefined;
  }

  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const calendarLabels = {
  labelNav: () => "Navegação do calendário",
  labelNext: () => "Ir para o próximo mês",
  labelPrevious: () => "Ir para o mês anterior",
  labelGrid: (date) =>
    `Calendário de ${new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    }).format(date)}`,
  labelDayButton: (date, modifiers) => {
    const label = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "full",
    }).format(date);
    const states = [
      modifiers.today ? "hoje" : "",
      modifiers.selected ? "selecionado" : "",
    ].filter(Boolean);

    return states.length ? `${label}, ${states.join(", ")}` : label;
  },
};

function Home() {
  const [selectedService, setSelectedService] = useState("");
  const [currentStep, setCurrentStep] = useState("service");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [occupiedTimes, setOccupiedTimes] = useState([]);
  const [isLoadingTimes, setIsLoadingTimes] = useState(false);
  const [timesError, setTimesError] = useState("");

  const services = ["Corte", "Barba", "Corte + Barba", "Sobrancelha", "Pigmentação", "Luzes"];
  const availableTimes = [
    "08:00", "09:00", "10:00", "11:00", "13:00",
    "14:00", "15:00", "16:00", "17:00", "18:00",
  ];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectedDateObject = parseLocalDate(selectedDate);
  const formattedDate = selectedDateObject
    ? new Intl.DateTimeFormat("pt-BR").format(selectedDateObject)
    : "";

  const handleDateSelect = (date) => {
    if (!date) {
      return;
    }

    setSelectedDate(formatLocalDate(date));
    setSelectedTime("");
  };

  const customerDataIsValid =
    customerName.trim().length >= 3 && customerPhone.length >= 10;

  useEffect(() => {
    let isCancelled = false;

    if (!selectedDate) {
      queueMicrotask(() => {
        if (!isCancelled) {
          setOccupiedTimes([]);
          setSelectedTime("");
          setTimesError("");
          setIsLoadingTimes(false);
        }
      });

      return () => {
        isCancelled = true;
      };
    }

    const fetchOccupiedTimes = async () => {
      setIsLoadingTimes(true);
      setTimesError("");

      try {
        const { data, error } = await supabase
          .from("occupied_appointments")
          .select("appointment_time")
          .eq("appointment_date", selectedDate);

        if (isCancelled) {
          return;
        }

        if (error) {
          console.error("Erro ao consultar horários ocupados:", error);
          setOccupiedTimes([]);
          setTimesError(
            "Não foi possível consultar os horários disponíveis.",
          );
          return;
        }

        const normalizedTimes = (data ?? [])
          .map(({ appointment_time }) => appointment_time?.slice(0, 5))
          .filter(Boolean);

        setOccupiedTimes(normalizedTimes);
        setSelectedTime((currentTime) =>
          normalizedTimes.includes(currentTime) ? "" : currentTime,
        );
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error("Erro inesperado ao consultar horários:", error);
        setOccupiedTimes([]);
        setTimesError(
          "Não foi possível consultar os horários disponíveis.",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingTimes(false);
        }
      }
    };

    fetchOccupiedTimes();

    return () => {
      isCancelled = true;
    };
  }, [selectedDate]);

  const handleConfirmAppointment = async () => {
    if (isSubmitting) {
      return;
    }

    setSubmitError("");
    setIsSubmitting(true);

    const normalizedPhone = customerPhone.replace(/\D/g, "");

    try {
      const { error } = await supabase
        .from("appointments")
        .insert({
          service: selectedService,
          appointment_date: selectedDate,
          appointment_time: selectedTime,
          customer_name: customerName.trim(),
          customer_phone: normalizedPhone,
        });

      if (error) {
        console.error("Erro ao confirmar agendamento:", error);

        if (error.code === "23505") {
          setSubmitError(
            "Este horário acabou de ser reservado. Escolha outro horário.",
          );
        } else {
          setSubmitError(
            "Não foi possível concluir o agendamento. Tente novamente.",
          );
        }

        return;
      }

      setOccupiedTimes((currentTimes) =>
        currentTimes.includes(selectedTime)
          ? currentTimes
          : [...currentTimes, selectedTime],
      );
      setIsConfirmed(true);
    } catch (error) {
      console.error("Erro inesperado ao confirmar agendamento:", error);
      setSubmitError(
        "Não foi possível concluir o agendamento. Tente novamente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetAppointment = () => {
    setSelectedService("");
    setCurrentStep("service");
    setSelectedDate("");
    setSelectedTime("");
    setCustomerName("");
    setCustomerPhone("");
    setIsConfirmed(false);
    setIsSubmitting(false);
    setSubmitError("");
    setOccupiedTimes([]);
    setIsLoadingTimes(false);
    setTimesError("");
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand notranslate" href="#main-content" aria-label="BarbershopStyle — início" translate="no">
          <span className="brand-mark" aria-hidden="true">B</span>
          <span>BarbershopStyle</span>
        </a>
      </header>

      <main id="main-content" className="home">
        {currentStep === "service" && (
          <section aria-labelledby="services-title">
            <div className="intro">
              <p className="eyebrow">Agendamento · Etapa 1 de 5</p>
              <h1 id="services-title">Escolha seu serviço</h1>
              <p className="intro-text">
                Selecione o cuidado ideal para você. Todos os serviços têm duração de 1 hora.
              </p>
            </div>
            <div className="services-grid">
              {services.map((service) => (
                <ServiceCard
                  key={service}
                  nome={service}
                  duracao="1 hora"
                  isSelected={selectedService === service}
                  onSelect={() => setSelectedService(service)}
                />
              ))}
            </div>
            <div className="selection-footer" aria-live="polite">
              <p className="selected-service">
                Serviço selecionado: <strong>{selectedService || "Nenhum"}</strong>
              </p>
              <Button texto="Continuar" disabled={!selectedService}
                onClick={() => setCurrentStep("date")} />
            </div>
          </section>
        )}

        {currentStep === "date" && (
          <section className="date-step" aria-labelledby="date-title">
            <div className="intro">
              <p className="eyebrow">Agendamento · Etapa 2 de 5</p>
              <p className="step-service">
                Serviço selecionado: <strong>{selectedService}</strong>
              </p>
              <h1 id="date-title">Escolha uma data</h1>
              <p className="intro-text">Selecione o melhor dia para o seu atendimento.</p>
            </div>
            <div className="date-panel">
              <p id="appointment-date-label" className="date-label">
                Data do atendimento
              </p>
              <div className="calendar-container">
                <DayPicker
                  mode="single"
                  locale={ptBR}
                  weekStartsOn={0}
                  showOutsideDays
                  navLayout="around"
                  selected={selectedDateObject}
                  onSelect={handleDateSelect}
                  disabled={{ before: today }}
                  labels={calendarLabels}
                  aria-labelledby="appointment-date-label"
                />
              </div>
              {selectedDate && (
                <p className="selected-date" aria-live="polite">
                  Data selecionada: <strong>{formattedDate}</strong>
                </p>
              )}
            </div>
            <div className="date-actions">
              <Button texto="Voltar" variant="outline" onClick={() => setCurrentStep("service")} />
              <Button texto="Continuar" disabled={!selectedDate}
                onClick={() => setCurrentStep("time")} />
            </div>
          </section>
        )}

        {currentStep === "time" && (
          <section className="time-step" aria-labelledby="time-title">
            <div className="intro">
              <p className="eyebrow">Agendamento · Etapa 3 de 5</p>
              <div className="appointment-summary">
                <p>Serviço: <strong>{selectedService}</strong></p>
                <p>Data: <strong>{formattedDate}</strong></p>
              </div>
              <h1 id="time-title">Escolha um horário</h1>
              <p className="intro-text">Selecione um dos horários disponíveis para o atendimento.</p>
            </div>
            <div className="time-panel">
              <p id="time-options-label">Horários disponíveis</p>
              {isLoadingTimes && (
                <p className="times-message" role="status" aria-live="polite">
                  Consultando horários disponíveis...
                </p>
              )}
              {timesError && (
                <p className="times-error" role="alert" aria-live="assertive">
                  {timesError}
                </p>
              )}
              <div className="times-grid" role="group" aria-labelledby="time-options-label">
                {availableTimes.map((time) => {
                  const isOccupied = occupiedTimes.includes(time);
                  const isUnavailable =
                    isOccupied || isLoadingTimes || Boolean(timesError);

                  return (
                    <button
                      key={time}
                      className={`time-option${selectedTime === time ? " time-option--selected" : ""}${isOccupied ? " time-option--occupied" : ""}`}
                      type="button"
                      disabled={isUnavailable}
                      aria-disabled={isUnavailable}
                      aria-pressed={selectedTime === time}
                      onClick={() => {
                        if (!isOccupied) {
                          setSelectedTime(time);
                        }
                      }}
                    >
                      <span>{time}</span>
                      {isOccupied && <span className="time-status">Ocupado</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="date-actions">
              <Button texto="Voltar" variant="outline" onClick={() => setCurrentStep("date")} />
              <Button
                texto="Continuar"
                disabled={
                  !selectedTime ||
                  isLoadingTimes ||
                  Boolean(timesError) ||
                  occupiedTimes.includes(selectedTime)
                }
                onClick={() => setCurrentStep("customer")} />
            </div>
          </section>
        )}

        {currentStep === "customer" && (
          <section className="customer-step" aria-labelledby="customer-title">
            <div className="intro">
              <p className="eyebrow">Agendamento · Etapa 4 de 5</p>
              <div className="appointment-summary">
                <p>Serviço: <strong>{selectedService}</strong></p>
                <p>Data: <strong>{formattedDate}</strong></p>
                <p>Horário: <strong>{selectedTime}</strong></p>
              </div>
              <h1 id="customer-title">Seus dados</h1>
              <p className="intro-text">Informe seus dados para continuar o agendamento.</p>
            </div>
            <form className="customer-form" onSubmit={(event) => event.preventDefault()}>
              <div className="form-field">
                <label htmlFor="customer-name">Nome</label>
                <input
                  id="customer-name"
                  type="text"
                  autoComplete="name"
                  required
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor="customer-phone">Telefone</label>
                <input
                  id="customer-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  pattern="[0-9]*"
                  maxLength="11"
                  required
                  value={customerPhone}
                  onChange={(event) => {
                    const numbersOnly = event.target.value.replace(/\D/g, "").slice(0, 11);
                    setCustomerPhone(numbersOnly);
                  }}
                />
                <p className="field-hint">Digite 10 ou 11 números, incluindo o DDD.</p>
              </div>
            </form>
            <div className="date-actions">
              <Button texto="Voltar" variant="outline" onClick={() => setCurrentStep("time")} />
              <Button texto="Continuar" disabled={!customerDataIsValid}
                onClick={() => setCurrentStep("confirmation")} />
            </div>
          </section>
        )}

        {currentStep === "confirmation" && (
          <section className="confirmation-step" aria-labelledby="confirmation-title">
            <div className="intro">
              <p className="eyebrow">Agendamento · Etapa 5 de 5</p>
              <h1 id="confirmation-title">
                {isConfirmed ? "Agendamento confirmado" : "Confirme seu agendamento"}
              </h1>
              <p className="intro-text">
                {isConfirmed ? "Seu horário foi reservado." : "Revise os dados antes de confirmar."}
              </p>
            </div>

            <dl className="confirmation-card">
              <div><dt>Serviço</dt><dd>{selectedService}</dd></div>
              <div><dt>Data</dt><dd>{formattedDate}</dd></div>
              <div><dt>Horário</dt><dd>{selectedTime}</dd></div>
              <div><dt>Nome</dt><dd>{customerName}</dd></div>
              <div><dt>Telefone</dt><dd>{customerPhone}</dd></div>
            </dl>

            {isConfirmed ? (
              <div className="confirmation-success" role="status">
                <p>Agendamento confirmado com sucesso!</p>
                <Button texto="Novo agendamento" onClick={resetAppointment} />
              </div>
            ) : (
              <div className="confirmation-controls">
                {submitError && (
                  <p className="submit-error" role="alert" aria-live="assertive">
                    {submitError}
                  </p>
                )}
                <div className="date-actions">
                  <Button texto="Voltar" variant="outline"
                    onClick={() => setCurrentStep("customer")} />
                  <Button
                    texto={isSubmitting ? "Agendando..." : "Confirmar agendamento"}
                    disabled={isSubmitting}
                    onClick={handleConfirmAppointment}
                  />
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default Home;
