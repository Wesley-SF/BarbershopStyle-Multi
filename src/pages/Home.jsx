import { useEffect, useState } from "react";
import { DayPicker } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import { Link } from "react-router-dom";
import "react-day-picker/style.css";
import Brand from "../components/Brand";
import Button from "../components/Button";
import ServiceCard from "../components/ServiceCard";
import { APPOINTMENT_STATUS } from "../config/appointmentStatus";
import {
  SERVICES,
  getIncludingService,
  normalizeSelectedServices,
} from "../config/services";
import { supabase } from "../lib/supabase";
import { formatDateBR } from "../utils/date";
import { hasAllDayScheduleBlock } from "../utils/scheduleBlocks";
import {
  calculateEndTime,
  calculateTotalDuration,
  formatDuration,
  generateAvailableSlots,
  getBusinessHoursForDate,
  isSameLocalDate,
  isTimeAvailable,
} from "../utils/time";

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

function formatServicesList(selectedServices) {
  if (selectedServices.length === 0) {
    return "Nenhum";
  }

  if (selectedServices.length === 1) {
    return selectedServices[0];
  }

  return `${selectedServices.slice(0, -1).join(", ")} e ${selectedServices.at(-1)}`;
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
  const [selectedServices, setSelectedServices] = useState([]);
  const [currentStep, setCurrentStep] = useState("service");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [appointmentsForDate, setAppointmentsForDate] = useState([]);
  const [scheduleBlocksForDate, setScheduleBlocksForDate] = useState([]);
  const [isLoadingTimes, setIsLoadingTimes] = useState(false);
  const [timesError, setTimesError] = useState("");
  const [availabilityNotice, setAvailabilityNotice] = useState("");
  const [availabilityNow, setAvailabilityNow] = useState(() => new Date());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectedDateObject = parseLocalDate(selectedDate);
  const formattedDate = selectedDate ? formatDateBR(selectedDate) : "";
  const selectedBusinessHours = getBusinessHoursForDate(selectedDate);
  const selectedServicesText = formatServicesList(selectedServices);
  const totalDuration = calculateTotalDuration(selectedServices);
  const estimatedEndTime = selectedTime
    ? calculateEndTime(selectedTime, totalDuration)
    : "";
  const availableTimes = generateAvailableSlots(
    selectedDate,
    totalDuration,
    appointmentsForDate,
    scheduleBlocksForDate,
    availabilityNow,
  );
  const isSelectedDateToday = isSameLocalDate(selectedDate, availabilityNow);
  const isSelectedDateFullyBlocked = hasAllDayScheduleBlock(
    scheduleBlocksForDate,
  );
  const customerDataIsValid =
    customerName.trim().length >= 3 && customerPhone.length >= 10;

  const handleDateSelect = (date) => {
    if (!date) {
      return;
    }

    setSelectedDate(formatLocalDate(date));
    setAvailabilityNow(new Date());
    setSelectedTime("");
    setAvailabilityNotice("");
  };

  const handleServiceToggle = (service) => {
    if (getIncludingService(service, selectedServices)) return;

    const nextServices = normalizeSelectedServices(
      selectedServices.includes(service)
        ? selectedServices.filter((currentService) => currentService !== service)
        : [...selectedServices, service],
    );
    const nextDuration = calculateTotalDuration(nextServices);
    const nextAvailableTimes = generateAvailableSlots(
      selectedDate,
      nextDuration,
      appointmentsForDate,
      scheduleBlocksForDate,
      new Date(),
    );

    setSelectedServices(nextServices);
    setAvailabilityNotice("");

    if (selectedTime && !nextAvailableTimes.includes(selectedTime)) {
      setSelectedTime("");
    }
  };
  useEffect(() => {
    let isCancelled = false;

    if (!selectedDate) {
      queueMicrotask(() => {
        if (!isCancelled) {
          setAppointmentsForDate([]);
          setScheduleBlocksForDate([]);
          setSelectedTime("");
          setTimesError("");
          setIsLoadingTimes(false);
        }
      });

      return () => {
        isCancelled = true;
      };
    }

    const fetchAppointmentsForDate = async () => {
      setIsLoadingTimes(true);
      setTimesError("");

      try {
        const [appointmentsResult, blocksResult] = await Promise.all([
          supabase
            .from("occupied_appointments")
            .select("appointment_time, service, duration_minutes, status")
            .eq("appointment_date", selectedDate),
          supabase
            .from("schedule_blocks")
            .select("block_date, start_time, end_time, all_day")
            .eq("block_date", selectedDate),
        ]);

        if (isCancelled) {
          return;
        }

        if (appointmentsResult.error || blocksResult.error) {
          console.error("Erro ao consultar disponibilidade:", {
            appointmentsError: appointmentsResult.error,
            blocksError: blocksResult.error,
          });
          setAppointmentsForDate([]);
          setScheduleBlocksForDate([]);
          setTimesError(
            "Não foi possível consultar os horários disponíveis.",
          );
          return;
        }

        const appointments = appointmentsResult.data ?? [];
        const scheduleBlocks = blocksResult.data ?? [];
        const currentDateTime = new Date();
        const refreshedAvailableTimes = generateAvailableSlots(
          selectedDate,
          totalDuration,
          appointments,
          scheduleBlocks,
          currentDateTime,
        );

        setAppointmentsForDate(appointments);
        setScheduleBlocksForDate(scheduleBlocks);
        setAvailabilityNow(currentDateTime);
        setSelectedTime((currentTime) =>
          currentTime && !refreshedAvailableTimes.includes(currentTime)
            ? ""
            : currentTime,
        );
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error("Erro inesperado ao consultar horários:", error);
        setAppointmentsForDate([]);
        setScheduleBlocksForDate([]);
        setTimesError(
          "Não foi possível consultar os horários disponíveis.",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingTimes(false);
        }
      }
    };

    fetchAppointmentsForDate();

    return () => {
      isCancelled = true;
    };
  }, [selectedDate, totalDuration]);

  useEffect(() => {
    if (currentStep !== "time") {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      const currentDateTime = new Date();
      const refreshedAvailableTimes = generateAvailableSlots(
        selectedDate,
        totalDuration,
        appointmentsForDate,
        scheduleBlocksForDate,
        currentDateTime,
      );

      setAvailabilityNow(currentDateTime);

      if (selectedTime && !refreshedAvailableTimes.includes(selectedTime)) {
        setSelectedTime("");
        setAvailabilityNotice(
          "O horário selecionado não está mais disponível. Escolha outro.",
        );
      }
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [
    appointmentsForDate,
    currentStep,
    scheduleBlocksForDate,
    selectedDate,
    selectedTime,
    totalDuration,
  ]);

  const handleOpenTimeStep = () => {
    setAvailabilityNow(new Date());
    setCurrentStep("time");
  };

  const handleConfirmAppointment = async () => {
    if (isSubmitting) {
      return;
    }

    setSubmitError("");
    setIsSubmitting(true);

    const normalizedPhone = customerPhone.replace(/\D/g, "");
    const normalizedServices = normalizeSelectedServices(selectedServices);
    const serviceNames = normalizedServices.join(", ");
    const submissionDuration = calculateTotalDuration(normalizedServices);

    setSelectedServices(normalizedServices);

    try {
      const [appointmentsResult, blocksResult] = await Promise.all([
        supabase
          .from("occupied_appointments")
          .select("appointment_time, service, duration_minutes, status")
          .eq("appointment_date", selectedDate),
        supabase
          .from("schedule_blocks")
          .select("block_date, start_time, end_time, all_day")
          .eq("block_date", selectedDate),
      ]);

      if (appointmentsResult.error || blocksResult.error) {
        console.error("Erro ao revalidar a disponibilidade:", {
          appointmentsError: appointmentsResult.error,
          blocksError: blocksResult.error,
        });
        setSubmitError(
          "Não foi possível confirmar a disponibilidade. Tente novamente.",
        );
        return;
      }

      const appointments = appointmentsResult.data ?? [];
      const scheduleBlocks = blocksResult.data ?? [];
      const validationDateTime = new Date();
      setAppointmentsForDate(appointments);
      setScheduleBlocksForDate(scheduleBlocks);
      setAvailabilityNow(validationDateTime);

      if (
        !isTimeAvailable(
          selectedDate,
          selectedTime,
          submissionDuration,
          appointments,
          scheduleBlocks,
          validationDateTime,
        )
      ) {
        setSelectedTime("");
        setAvailabilityNotice(
          "Este horário não está mais disponível. Escolha outro horário.",
        );
        setCurrentStep("time");
        return;
      }

      const { error } = await supabase
        .from("appointments")
        .insert({
          service: serviceNames,
          appointment_date: selectedDate,
          appointment_time: selectedTime,
          duration_minutes: submissionDuration,
          customer_name: customerName.trim(),
          customer_phone: normalizedPhone,
        });

      if (error) {
        console.error("Erro ao criar agendamento:", {
          code: error?.code,
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
        });

        if (error.code === "23505") {
          setSelectedTime("");
          setAvailabilityNotice(
            "Esse horário acabou de ser ocupado. Escolha outro horário.",
          );
          setCurrentStep("time");
        } else {
          setSubmitError(
            "Não foi possível concluir o agendamento. Tente novamente.",
          );
        }

        return;
      }

      setAppointmentsForDate((currentAppointments) => [
        ...currentAppointments,
        {
          appointment_time: selectedTime,
          service: serviceNames,
          duration_minutes: submissionDuration,
          status: APPOINTMENT_STATUS.PENDING,
        },
      ]);
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
    setSelectedServices([]);
    setCurrentStep("service");
    setSelectedDate("");
    setSelectedTime("");
    setCustomerName("");
    setCustomerPhone("");
    setIsConfirmed(false);
    setIsSubmitting(false);
    setSubmitError("");
    setAppointmentsForDate([]);
    setScheduleBlocksForDate([]);
    setIsLoadingTimes(false);
    setTimesError("");
    setAvailabilityNotice("");
    setAvailabilityNow(new Date());
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <a
          className="brand notranslate"
          href="#main-content"
          aria-label="Kallé Cortes — início"
          translate="no"
        >
          <Brand />
        </a>
        <Link className="admin-link" to="/admin">Painel administrativo</Link>
      </header>

      <main id="main-content" className="home">
        {currentStep === "service" && (
          <section aria-labelledby="services-title">
            <div className="intro">
              <p className="eyebrow">Agendamento · Etapa 1 de 5</p>
              <h1 id="services-title">Escolha seus serviços</h1>
              <p className="intro-text">
                Selecione um ou mais procedimentos para calcular o tempo do atendimento.
              </p>
            </div>
            <div className="services-grid">
              {SERVICES.map((service) => {
                const includingService = getIncludingService(
                  service.name,
                  selectedServices,
                );

                return (
                  <ServiceCard
                    key={service.name}
                    nome={service.name}
                    duracao={formatDuration(service.duration)}
                    isSelected={selectedServices.includes(service.name)}
                    isDisabled={Boolean(includingService)}
                    disabledReason={
                      includingService ? `Já incluído em ${includingService}` : ""
                    }
                    onSelect={() => handleServiceToggle(service.name)}
                  />
                );
              })}
            </div>
            <div className="selection-footer" aria-live="polite">
              <div className="selected-service">
                <p>Serviços selecionados: <strong>{selectedServicesText}</strong></p>
                <p>
                  {selectedServices.length} {selectedServices.length === 1
                    ? "procedimento selecionado"
                    : "procedimentos selecionados"}
                </p>
                <p>Tempo estimado: <strong>{formatDuration(totalDuration)}</strong></p>
              </div>
              <Button
                texto="Continuar"
                disabled={selectedServices.length === 0}
                onClick={() => setCurrentStep("date")}
              />
            </div>
          </section>
        )}

        {currentStep === "date" && (
          <section className="date-step" aria-labelledby="date-title">
            <div className="intro">
              <p className="eyebrow">Agendamento · Etapa 2 de 5</p>
              <p className="step-service">
                Serviços selecionados: <strong>{selectedServicesText}</strong>
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
              {selectedBusinessHours && (
                <p className="business-hours-note">
                  Horário de atendimento neste dia: <strong>{selectedBusinessHours.start} às {selectedBusinessHours.end}</strong>
                </p>
              )}
            </div>
            <div className="date-actions">
              <Button texto="Voltar" variant="outline" onClick={() => setCurrentStep("service")} />
              <Button texto="Continuar" disabled={!selectedDate} onClick={handleOpenTimeStep} />
            </div>
          </section>
        )}

        {currentStep === "time" && (
          <section className="time-step" aria-labelledby="time-title">
            <div className="intro">
              <p className="eyebrow">Agendamento · Etapa 3 de 5</p>
              <div className="appointment-summary">
                <p>Serviços: <strong>{selectedServicesText}</strong></p>
                <p>Data: <strong>{formattedDate}</strong></p>
                <p>Duração estimada: <strong>{formatDuration(totalDuration)}</strong></p>
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
              {availabilityNotice && (
                <p className="times-error" role="alert" aria-live="assertive">
                  {availabilityNotice}
                </p>
              )}
              {!isLoadingTimes && !timesError && isSelectedDateFullyBlocked && (
                <p className="times-message">
                  Não há atendimento disponível nesta data.
                </p>
              )}
              {!isLoadingTimes &&
                !timesError &&
                !isSelectedDateFullyBlocked &&
                isSelectedDateToday &&
                availableTimes.length === 0 && (
                  <p className="times-message">
                    Não há mais horários disponíveis para hoje.
                  </p>
                )}
              {!isLoadingTimes &&
                !timesError &&
                !isSelectedDateFullyBlocked &&
                !isSelectedDateToday &&
                availableTimes.length === 0 && (
                  <p className="times-message">
                    Nenhum horário disponível para esta duração.
                  </p>
                )}
              <div className="times-grid" role="group" aria-labelledby="time-options-label">
                {availableTimes.map((time) => (
                  <button
                    key={time}
                    className={`time-option${selectedTime === time ? " time-option--selected" : ""}`}
                    type="button"
                    disabled={isLoadingTimes || Boolean(timesError)}
                    aria-disabled={isLoadingTimes || Boolean(timesError)}
                    aria-pressed={selectedTime === time}
                    onClick={() => {
                      setSelectedTime(time);
                      setAvailabilityNotice("");
                    }}
                  >
                    <span>{time}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="date-actions">
              <Button texto="Voltar" variant="outline" onClick={() => setCurrentStep("date")} />
              <Button
                texto="Continuar"
                disabled={!selectedTime || isLoadingTimes || Boolean(timesError)}
                onClick={() => setCurrentStep("customer")}
              />
            </div>
          </section>
        )}

        {currentStep === "customer" && (
          <section className="customer-step" aria-labelledby="customer-title">
            <div className="intro">
              <p className="eyebrow">Agendamento · Etapa 4 de 5</p>
              <div className="appointment-summary">
                <p>Serviços: <strong>{selectedServicesText}</strong></p>
                <p>Data: <strong>{formattedDate}</strong></p>
                <p>Horário: <strong>{selectedTime} às {estimatedEndTime}</strong></p>
                <p>Duração estimada: <strong>{formatDuration(totalDuration)}</strong></p>
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
              <Button texto="Voltar" variant="outline" onClick={handleOpenTimeStep} />
              <Button
                texto="Continuar"
                disabled={!customerDataIsValid}
                onClick={() => setCurrentStep("confirmation")}
              />
            </div>
          </section>
        )}

        {currentStep === "confirmation" && (
          <section className="confirmation-step" aria-labelledby="confirmation-title">
            {isConfirmed ? (
              <article className="success-card" role="status">
                <span className="success-icon" aria-hidden="true">✓</span>
                <p className="eyebrow">Tudo certo</p>
                <h1 id="confirmation-title">Agendamento confirmado!</h1>
                <p className="success-message">Seu horário foi reservado com sucesso.</p>
                <dl className="success-summary">
                  <div><dt>Nome</dt><dd>{customerName}</dd></div>
                  <div><dt>Serviços</dt><dd>{selectedServicesText}</dd></div>
                  <div><dt>Data</dt><dd>{formattedDate}</dd></div>
                  <div><dt>Horário inicial</dt><dd>{selectedTime}</dd></div>
                  <div><dt>Término previsto</dt><dd>{estimatedEndTime}</dd></div>
                  <div><dt>Duração estimada</dt><dd>{formatDuration(totalDuration)}</dd></div>
                  <div><dt>Forma de pagamento</dt><dd>Pagamento no local</dd></div>
                </dl>
                <Button texto="Fazer novo agendamento" onClick={resetAppointment} />
              </article>
            ) : (
              <>
                <div className="intro">
                  <p className="eyebrow">Agendamento · Etapa 5 de 5</p>
                  <h1 id="confirmation-title">Confirme seu agendamento</h1>
                  <p className="intro-text">Revise os dados antes de confirmar.</p>
                </div>
                <dl className="confirmation-card">
                  <div><dt>Serviços</dt><dd>{selectedServicesText}</dd></div>
                  <div><dt>Data</dt><dd>{formattedDate}</dd></div>
                  <div><dt>Horário inicial</dt><dd>{selectedTime}</dd></div>
                  <div><dt>Término previsto</dt><dd>{estimatedEndTime}</dd></div>
                  <div><dt>Duração estimada</dt><dd>{formatDuration(totalDuration)}</dd></div>
                  <div><dt>Nome</dt><dd>{customerName}</dd></div>
                  <div><dt>Telefone</dt><dd>{customerPhone}</dd></div>
                </dl>
                <div className="confirmation-controls">
                  {submitError && (
                    <p className="submit-error" role="alert" aria-live="assertive">
                      {submitError}
                    </p>
                  )}
                  <div className="date-actions">
                    <Button texto="Voltar" variant="outline" onClick={() => setCurrentStep("customer")} />
                    <Button
                      texto={isSubmitting ? "Confirmando..." : "Confirmar agendamento"}
                      disabled={isSubmitting}
                      onClick={handleConfirmAppointment}
                    />
                  </div>
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default Home;