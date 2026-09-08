import { useCallback, useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import { Link, useParams } from "react-router-dom";
import "react-day-picker/style.css";
import Brand from "../components/Brand";
import Button from "../components/Button";
import ServiceCard from "../components/ServiceCard";
import { APPOINTMENT_STATUS } from "../config/appointmentStatus";
import {
  getIncludingService,
  normalizeSelectedServices,
} from "../config/services";
import { supabase } from "../lib/supabase";
import { formatDateBR } from "../utils/date";
import { hasAllDayScheduleBlock } from "../utils/scheduleBlocks";
import {
  getInstagramUrl,
  getStoreThemeStyle,
  normalizeStoreBranding,
} from "../utils/storeBranding";
import {
  calculateEndTime,
  formatDuration,
  generateAvailableSlots,
  getBusinessHoursForDate,
  getDateTimeInTimeZone,
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
  const { storeSlug } = useParams();
  const [store, setStore] = useState(null);
  const [isLoadingStore, setIsLoadingStore] = useState(true);
  const [storeError, setStoreError] = useState("");
  const [services, setServices] = useState([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [servicesError, setServicesError] = useState("");
  const [servicesRefreshKey, setServicesRefreshKey] = useState(0);
  const [serviceSelectionNotice, setServiceSelectionNotice] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
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

  const bookingRules = useMemo(
    () => ({
      businessHours: store?.business_hours ?? {},
      slotIntervalMinutes: store?.slot_interval_minutes,
      minimumBookingNoticeMinutes: store?.minimum_booking_notice_minutes,
    }),
    [store],
  );
  const getStoreNow = useCallback(
    () => getDateTimeInTimeZone(store?.timezone),
    [store],
  );
  const today = new Date(availabilityNow);
  today.setHours(0, 0, 0, 0);

  const selectedDateObject = parseLocalDate(selectedDate);
  const formattedDate = selectedDate ? formatDateBR(selectedDate) : "";
  const selectedBusinessHours = getBusinessHoursForDate(selectedDate, bookingRules);
  const selectedServices = selectedServiceIds
    .map((serviceId) => services.find((service) => service.id === serviceId))
    .filter(Boolean);
  const selectedServiceNames = selectedServices.map((service) => service.name);
  const selectedServicesText = formatServicesList(selectedServiceNames);
  const totalDuration = selectedServices.reduce(
    (total, service) => total + service.duration_minutes,
    0,
  );
  const estimatedEndTime = selectedTime
    ? calculateEndTime(selectedTime, totalDuration)
    : "";
  const availableTimes = generateAvailableSlots(
    selectedDate,
    totalDuration,
    appointmentsForDate,
    scheduleBlocksForDate,
    availabilityNow,
    bookingRules,
  );
  const isSelectedDateToday = isSameLocalDate(selectedDate, availabilityNow);
  const isSelectedDateFullyBlocked = hasAllDayScheduleBlock(
    scheduleBlocksForDate,
  );
  const customerDataIsValid =
    customerName.trim().length >= 3 && customerPhone.length >= 10;

  useEffect(() => {
    let isCancelled = false;

    const fetchStore = async () => {
      setIsLoadingStore(true);
      setStoreError("");
      setStore(null);
      setServices([]);
      setSelectedServiceIds([]);
      setServiceSelectionNotice("");

      const { data, error } = await supabase
        .from("stores")
        .select("id, name, slug, timezone, business_hours, slot_interval_minutes, minimum_booking_notice_minutes, display_name, logo_url, primary_color, secondary_color, accent_color, phone, instagram, address")
        .eq("slug", storeSlug)
        .eq("active", true)
        .maybeSingle();

      if (isCancelled) return;

      if (error) {
        console.error("Erro ao carregar loja:", error);
        setStoreError("Não foi possível carregar esta loja.");
      } else if (!data) {
        setStoreError("Loja não encontrada ou indisponível.");
      } else {
        const brandedStore = normalizeStoreBranding(data);
        setStore(brandedStore);
        setAvailabilityNow(getDateTimeInTimeZone(data.timezone));
        document.title = brandedStore.display_name;
      }

      setIsLoadingStore(false);
    };

    if (storeSlug) void fetchStore();

    return () => {
      isCancelled = true;
    };
  }, [storeSlug]);

  useEffect(() => {
    let isCancelled = false;

    const fetchServices = async () => {
      setIsLoadingServices(true);
      setServicesError("");

      const { data, error } = await supabase
        .from("services")
        .select("id, name, duration_minutes")
        .eq("store_id", store.id)
        .eq("active", true)
        .order("created_at", { ascending: true });

      if (isCancelled) return;

      if (error) {
        console.error("Erro ao carregar serviços:", error);
        setServices([]);
        setServicesError("Não foi possível carregar os serviços desta loja.");
      } else {
        setServices(data ?? []);
      }

      setIsLoadingServices(false);
    };

    if (store?.id) void fetchServices();

    return () => {
      isCancelled = true;
    };
  }, [servicesRefreshKey, store?.id]);

  const handleDateSelect = (date) => {
    if (!date) {
      return;
    }

    setSelectedDate(formatLocalDate(date));
    setAvailabilityNow(getStoreNow());
    setSelectedTime("");
    setAvailabilityNotice("");
  };

  const handleServiceToggle = (service) => {
    if (getIncludingService(service.name, selectedServiceNames)) return;

    const toggledServiceNames = selectedServiceIds.includes(service.id)
      ? selectedServiceNames.filter((serviceName) => serviceName !== service.name)
      : [...selectedServiceNames, service.name];
    const normalizedServiceNames = normalizeSelectedServices(
      toggledServiceNames,
    );
    const nextServiceIds = normalizedServiceNames
      .map(
        (serviceName) =>
          services.find((availableService) => availableService.name === serviceName)?.id,
      )
      .filter(Boolean);
    const nextDuration = services
      .filter((availableService) => nextServiceIds.includes(availableService.id))
      .reduce((total, availableService) => total + availableService.duration_minutes, 0);
    const nextAvailableTimes = generateAvailableSlots(
      selectedDate,
      nextDuration,
      appointmentsForDate,
      scheduleBlocksForDate,
      getStoreNow(),
      bookingRules,
    );

    setSelectedServiceIds(nextServiceIds);
    setServiceSelectionNotice("");
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

    if (!store?.id) {
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
            .eq("store_id", store.id)
            .eq("appointment_date", selectedDate),
          supabase
            .from("public_schedule_blocks")
            .select("block_date, start_time, end_time, all_day")
            .eq("store_id", store.id)
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
        const currentDateTime = getStoreNow();
        const refreshedAvailableTimes = generateAvailableSlots(
          selectedDate,
          totalDuration,
          appointments,
          scheduleBlocks,
          currentDateTime,
          bookingRules,
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
  }, [
    selectedDate,
    store?.id,
    bookingRules,
    getStoreNow,
    totalDuration,
  ]);

  useEffect(() => {
    if (currentStep !== "time") {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      const currentDateTime = getStoreNow();
      const refreshedAvailableTimes = generateAvailableSlots(
        selectedDate,
        totalDuration,
        appointmentsForDate,
        scheduleBlocksForDate,
        currentDateTime,
        bookingRules,
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
    bookingRules,
    getStoreNow,
    totalDuration,
  ]);

  const handleOpenTimeStep = () => {
    setAvailabilityNow(getStoreNow());
    setCurrentStep("time");
  };

  const handleConfirmAppointment = async () => {
    if (isSubmitting) {
      return;
    }

    setSubmitError("");
    setIsSubmitting(true);

    const normalizedPhone = customerPhone.replace(/\D/g, "");
    const submissionDuration = totalDuration;

    try {
      const [appointmentsResult, blocksResult] = await Promise.all([
        supabase
          .from("occupied_appointments")
          .select("appointment_time, service, duration_minutes, status")
          .eq("store_id", store.id)
          .eq("appointment_date", selectedDate),
        supabase
          .from("public_schedule_blocks")
          .select("block_date, start_time, end_time, all_day")
          .eq("store_id", store.id)
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
      const validationDateTime = getStoreNow();
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
          bookingRules,
        )
      ) {
        setSelectedTime("");
        setAvailabilityNotice(
          "Este horário não está mais disponível. Escolha outro horário.",
        );
        setCurrentStep("time");
        return;
      }

      const { data, error } = await supabase.rpc("create_public_appointment", {
        p_store_slug: store.slug,
        p_service_ids: selectedServiceIds,
        p_appointment_date: selectedDate,
        p_appointment_time: selectedTime,
        p_customer_name: customerName.trim(),
        p_customer_phone: normalizedPhone,
      });

      if (error) {
        console.error("Erro ao criar agendamento pela operação transacional:", {
          code: error?.code,
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
        });

        const databaseMessage = `${error?.message ?? ""} ${error?.details ?? ""}`;

        if (
          databaseMessage.includes("APPOINTMENT_CONFLICT") ||
          databaseMessage.includes("APPOINTMENT_BLOCKED") ||
          databaseMessage.includes("BOOKING_NOTICE_REQUIRED") ||
          databaseMessage.includes("OUTSIDE_BUSINESS_HOURS") ||
          databaseMessage.includes("STORE_CLOSED")
        ) {
          setSelectedTime("");
          setAvailabilityNotice(
            "Este horário não está mais disponível. Escolha outro horário.",
          );
          setCurrentStep("time");
        } else if (databaseMessage.includes("INVALID_SERVICES")) {
          setSelectedServiceIds([]);
          setServiceSelectionNotice(
            "Um dos serviços selecionados não está mais disponível. Escolha novamente.",
          );
          setServicesRefreshKey((currentKey) => currentKey + 1);
          setCurrentStep("service");
        } else if (databaseMessage.includes("STORE_NOT_FOUND")) {
          setSubmitError("Esta loja não está disponível para agendamentos.");
        } else {
          setSubmitError(
            "Não foi possível concluir o agendamento. Tente novamente.",
          );
        }

        return;
      }

      const createdAppointment = data?.[0];

      setAppointmentsForDate((currentAppointments) => [
        ...currentAppointments,
        {
          appointment_time:
            createdAppointment?.appointment_time ?? selectedTime,
          service:
            createdAppointment?.service ?? selectedServicesText,
          duration_minutes:
            createdAppointment?.duration_minutes ?? submissionDuration,
          status:
            createdAppointment?.status ?? APPOINTMENT_STATUS.PENDING,
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
    setSelectedServiceIds([]);
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
    setAvailabilityNow(getStoreNow());
  };

  if (isLoadingStore) {
    return (
      <div className="auth-loading" role="status">
        Carregando loja...
      </div>
    );
  }

  if (!store) {
    return (
      <div className="auth-loading" role="alert">
        {storeError || "Loja indisponível."}
      </div>
    );
  }

  return (
    <div className="app-shell" style={getStoreThemeStyle(store)}>
      <header className="site-header">
        <a
          className="brand notranslate"
          href="#main-content"
          aria-label={`${store.display_name} — início`}
          translate="no"
        >
          <Brand variant="home" displayName={store.display_name} logoUrl={store.logo_url} />
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
            {isLoadingServices && (
              <p className="times-message" role="status">
                Carregando serviços...
              </p>
            )}
            {servicesError && (
              <p className="times-error" role="alert">
                {servicesError}
              </p>
            )}
            {serviceSelectionNotice && (
              <p className="times-error" role="alert">
                {serviceSelectionNotice}
              </p>
            )}
            <div className="services-grid">
              {services.map((service) => {
                const includingService = getIncludingService(
                  service.name,
                  selectedServiceNames,
                );

                return (
                  <ServiceCard
                    key={service.id}
                    nome={service.name}
                    duracao={formatDuration(service.duration_minutes)}
                    isSelected={selectedServiceIds.includes(service.id)}
                    isDisabled={Boolean(includingService)}
                    disabledReason={
                      includingService ? `Já incluído em ${includingService}` : ""
                    }
                    onSelect={() => handleServiceToggle(service)}
                  />
                );
              })}
            </div>
            <div className="selection-footer" aria-live="polite">
              <div className="selected-service">
                <p>Serviços selecionados: <strong>{selectedServicesText}</strong></p>
                <p>
                  {selectedServiceIds.length} {selectedServiceIds.length === 1
                    ? "procedimento selecionado"
                    : "procedimentos selecionados"}
                </p>
                <p>Tempo estimado: <strong>{formatDuration(totalDuration)}</strong></p>
              </div>
              <Button
                texto="Continuar"
                disabled={
                  selectedServiceIds.length === 0 ||
                  isLoadingServices ||
                  Boolean(servicesError)
                }
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
      {(store.phone || store.instagram || store.address) && (
        <footer className="store-contact" aria-label="Informações da loja">
          <strong>{store.display_name}</strong>
          <div className="store-contact-links">
            {store.phone && <a href={`tel:${store.phone.replace(/[^\d+]/g, "")}`}>{store.phone}</a>}
            {store.instagram && <a href={getInstagramUrl(store.instagram)} target="_blank" rel="noreferrer">Instagram</a>}
            {store.address && <address>{store.address}</address>}
          </div>
        </footer>
      )}
    </div>
  );
}

export default Home;
