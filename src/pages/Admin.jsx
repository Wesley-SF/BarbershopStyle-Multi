import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminDateFilter from "../components/AdminDateFilter";
import Brand from "../components/Brand";
import ScheduleBlockCard from "../components/ScheduleBlockCard";
import ScheduleBlockForm from "../components/ScheduleBlockForm";
import { APPOINTMENT_STATUS } from "../config/appointmentStatus";
import { supabase } from "../lib/supabase";
import {
  formatDateBR,
  getLocalToday,
  isSameAppointmentDate,
} from "../utils/date";
import { sortScheduleBlocks } from "../utils/scheduleBlocks";
import {
  calculateEndTime,
  formatDuration,
  getAppointmentDuration,
  getAppointmentEndDateTime,
  isAppointmentInProgress,
} from "../utils/time";
import {
  createWhatsAppUrl,
  isValidBrazilianWhatsAppPhone,
} from "../utils/whatsapp";

const statusPriority = {
  [APPOINTMENT_STATUS.PENDING]: 1,
  [APPOINTMENT_STATUS.CONFIRMED]: 2,
  [APPOINTMENT_STATUS.COMPLETED]: 3,
  [APPOINTMENT_STATUS.CANCELLED]: 4,
};

function getAppointmentPriority(appointment, currentDateTime) {
  if (isAppointmentInProgress(appointment, currentDateTime)) {
    return 0;
  }

  return statusPriority[appointment.status] ?? 5;
}

function getAppointmentDateTime(appointment) {
  const [year, month, day] = appointment.appointment_date.split("-");
  const [hour, minute] = appointment.appointment_time.split(":");

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  ).getTime();
}

function sortAppointments(appointments, currentDateTime = new Date()) {
  return [...appointments].sort((firstAppointment, secondAppointment) => {
    const firstPriority = getAppointmentPriority(firstAppointment, currentDateTime);
    const secondPriority = getAppointmentPriority(secondAppointment, currentDateTime);

    if (firstPriority !== secondPriority) {
      return firstPriority - secondPriority;
    }

    if (firstAppointment.status === APPOINTMENT_STATUS.PENDING) {
      const firstCreatedAt = Date.parse(firstAppointment.created_at) || 0;
      const secondCreatedAt = Date.parse(secondAppointment.created_at) || 0;
      const createdAtDifference = secondCreatedAt - firstCreatedAt;

      if (createdAtDifference !== 0) {
        return createdAtDifference;
      }
    }

    const firstDateTime = getAppointmentDateTime(firstAppointment);
    const secondDateTime = getAppointmentDateTime(secondAppointment);

    if (firstAppointment.status === APPOINTMENT_STATUS.CONFIRMED) {
      return firstDateTime - secondDateTime;
    }

    return secondDateTime - firstDateTime;
  });
}

function sortAppointmentsByTime(appointments) {
  return [...appointments].sort(
    (firstAppointment, secondAppointment) =>
      getAppointmentDateTime(firstAppointment) -
      getAppointmentDateTime(secondAppointment),
  );
}
const statusLabels = {
  [APPOINTMENT_STATUS.PENDING]: "Pendente",
  [APPOINTMENT_STATUS.CONFIRMED]: "Confirmado",
  [APPOINTMENT_STATUS.CANCELLED]: "Cancelado",
  [APPOINTMENT_STATUS.COMPLETED]: "Concluído",
};

function translateStatus(status) {
  return statusLabels[status] ?? status ?? "—";
}

function getStatusClass(status) {
  return statusLabels[status] ? `status-badge--${status}` : "status-badge--default";
}

function Admin() {
  const [appointments, setAppointments] = useState([]);
  const [scheduleBlocks, setScheduleBlocks] = useState([]);
  const [isLoadingBlocks, setIsLoadingBlocks] = useState(true);
  const [blocksError, setBlocksError] = useState("");
  const [isSavingBlock, setIsSavingBlock] = useState(false);
  const [removingBlockId, setRemovingBlockId] = useState(null);
  const [createBlockFeedback, setCreateBlockFeedback] = useState({
    type: "",
    message: "",
  });
  const [removeBlockFeedback, setRemoveBlockFeedback] = useState({
    type: "",
    message: "",
  });
  const [activeTab, setActiveTab] = useState("agenda");
  const [agendaDateFilter, setAgendaDateFilter] = useState(getLocalToday);
  const [completedDateFilter, setCompletedDateFilter] = useState(getLocalToday);
  const [cancelledDateFilter, setCancelledDateFilter] = useState(getLocalToday);
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [updatingAppointmentId, setUpdatingAppointmentId] = useState(null);
  const [statusUpdateError, setStatusUpdateError] = useState("");
  const [statusUpdateSuccess, setStatusUpdateSuccess] = useState("");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [realtimeMessage, setRealtimeMessage] = useState("");
  const [highlightedAppointmentIds, setHighlightedAppointmentIds] = useState([]);
  const [whatsAppError, setWhatsAppError] = useState({
    appointmentId: null,
    message: "",
  });

  const highlightTimersRef = useRef(new Set());
  const messageTimerRef = useRef(null);
  const appointmentsRef = useRef([]);
  const completingAppointmentIdsRef = useRef(new Set());
  const navigate = useNavigate();

  const agendaAppointments = sortAppointments(
    appointments.filter(
      (appointment) =>
        [APPOINTMENT_STATUS.PENDING, APPOINTMENT_STATUS.CONFIRMED].includes(
          appointment.status,
        ) && isSameAppointmentDate(appointment, agendaDateFilter),
    ),
    currentDateTime,
  );
  const completedAppointments = sortAppointmentsByTime(
    appointments.filter(
      (appointment) =>
        appointment.status === APPOINTMENT_STATUS.COMPLETED &&
        isSameAppointmentDate(appointment, completedDateFilter),
    ),
  );
  const cancelledAppointments = sortAppointmentsByTime(
    appointments.filter(
      (appointment) =>
        appointment.status === APPOINTMENT_STATUS.CANCELLED &&
        isSameAppointmentDate(appointment, cancelledDateFilter),
    ),
  );
  const sortedScheduleBlocks = sortScheduleBlocks(scheduleBlocks);
  const pendingCount = agendaAppointments.filter(
    (appointment) => appointment.status === APPOINTMENT_STATUS.PENDING,
  ).length;
  const visibleAppointments =
    activeTab === "completed"
      ? completedAppointments
      : activeTab === "cancelled"
        ? cancelledAppointments
        : agendaAppointments;
  const dateFilterByTab = {
    agenda: agendaDateFilter,
    completed: completedDateFilter,
    cancelled: cancelledDateFilter,
  };
  const dateSetterByTab = {
    agenda: setAgendaDateFilter,
    completed: setCompletedDateFilter,
    cancelled: setCancelledDateFilter,
  };
  const activeDateFilter = dateFilterByTab[activeTab];

  const updateAppointmentToCompleted = useCallback(async (appointment) => {
    const updatingIds = completingAppointmentIdsRef.current;
    if (updatingIds.has(appointment.id)) return false;

    updatingIds.add(appointment.id);
    try {
      const { data, error } = await supabase
        .from("appointments")
        .update({ status: APPOINTMENT_STATUS.COMPLETED })
        .eq("id", appointment.id)
        .select("id, status");

      if (error) {
        console.error("Falha ao concluir atendimento:", {
          id: appointment.id,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return false;
      }

      const updatedAppointment = data?.find(
        (item) =>
          item.id === appointment.id &&
          item.status === APPOINTMENT_STATUS.COMPLETED,
      );

      if (!updatedAppointment) {
        console.error("O Supabase não atualizou nenhuma linha:", {
          id: appointment.id,
          data,
        });
        return false;
      }

      setAppointments((currentAppointments) =>
        sortAppointments(
          currentAppointments.map((item) =>
            item.id === appointment.id
              ? { ...item, status: updatedAppointment.status }
              : item,
          ),
        ),
      );
      return true;
    } catch (error) {
      console.error("Erro inesperado ao concluir atendimento:", {
        id: appointment.id,
        error,
      });
      return false;
    } finally {
      updatingIds.delete(appointment.id);
    }
  }, []);

  const completeFinishedAppointments = useCallback(async (appointmentsToCheck) => {
    const now = new Date();
    const confirmedAppointments = appointmentsToCheck.filter(
      (appointment) =>
        appointment.status === APPOINTMENT_STATUS.CONFIRMED,
    );

    let completedCount = 0;

    for (const appointment of confirmedAppointments) {
      const endDateTime = getAppointmentEndDateTime(appointment);
      const finished =
        endDateTime instanceof Date &&
        !Number.isNaN(endDateTime.getTime()) &&
        endDateTime.getTime() <= now.getTime();


      if (!finished) continue;
      if (await updateAppointmentToCompleted(appointment)) completedCount += 1;
    }

    return completedCount;
  }, [updateAppointmentToCompleted]);

  useEffect(() => {
    let isCancelled = false;

    const fetchAppointments = async () => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const { data, error } = await supabase
          .from("appointments")
          .select(
            "id, customer_name, customer_phone, service, appointment_date, appointment_time, status, created_at, duration_minutes",
          )
          .order("appointment_date", { ascending: true })
          .order("appointment_time", { ascending: true });

        if (isCancelled) {
          return;
        }

        if (error) {
          console.error("Erro ao carregar agendamentos:", error);
          setAppointments([]);
          setErrorMessage("Não foi possível carregar os agendamentos.");
          return;
        }

        const loadedAppointments = sortAppointments(data ?? []);
        setAppointments(loadedAppointments);
        await completeFinishedAppointments(loadedAppointments);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        console.error("Erro inesperado ao carregar agendamentos:", error);
        setAppointments([]);
        setErrorMessage("Não foi possível carregar os agendamentos.");
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchAppointments();

    return () => {
      isCancelled = true;
    };
  }, [completeFinishedAppointments]);

  useEffect(() => {
    let isCancelled = false;

    const fetchScheduleBlocks = async () => {
      setIsLoadingBlocks(true);
      setBlocksError("");

      try {
        const { data, error } = await supabase
          .from("schedule_blocks")
          .select("id, block_date, start_time, end_time, all_day, reason, created_at")
          .order("block_date", { ascending: true })
          .order("all_day", { ascending: false })
          .order("start_time", { ascending: true });

        if (isCancelled) return;

        if (error) {
          console.error("Erro ao carregar bloqueios:", error);
          setScheduleBlocks([]);
          setBlocksError("Não foi possível carregar os bloqueios.");
          return;
        }

        setScheduleBlocks(sortScheduleBlocks(data ?? []));
      } catch (error) {
        if (isCancelled) return;
        console.error("Erro inesperado ao carregar bloqueios:", error);
        setScheduleBlocks([]);
        setBlocksError("Não foi possível carregar os bloqueios.");
      } finally {
        if (!isCancelled) setIsLoadingBlocks(false);
      }
    };

    fetchScheduleBlocks();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    appointmentsRef.current = appointments;
  }, [appointments]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-schedule-blocks")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "schedule_blocks" },
        (payload) => {
          const newBlock = payload.new;
          setScheduleBlocks((currentBlocks) =>
            currentBlocks.some((scheduleBlock) => scheduleBlock.id === newBlock.id)
              ? currentBlocks
              : sortScheduleBlocks([...currentBlocks, newBlock]),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "schedule_blocks" },
        (payload) => {
          setScheduleBlocks((currentBlocks) =>
            currentBlocks.filter((scheduleBlock) => scheduleBlock.id !== payload.old.id),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = new Date();
      setCurrentDateTime(now);
      completeFinishedAppointments(appointmentsRef.current);
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [completeFinishedAppointments]);

  useEffect(() => {
    const highlightTimers = highlightTimersRef.current;

    const channel = supabase
      .channel("admin-new-appointments")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "appointments",
        },
        (payload) => {
          const newAppointment = payload.new;

          setAppointments((currentAppointments) => {
            if (
              currentAppointments.some(
                (appointment) => appointment.id === newAppointment.id,
              )
            ) {
              return currentAppointments;
            }

            return sortAppointments([newAppointment, ...currentAppointments]);
          });
          setHighlightedAppointmentIds((currentIds) =>
            currentIds.includes(newAppointment.id)
              ? currentIds
              : [...currentIds, newAppointment.id],
          );
          setRealtimeMessage("Novo agendamento recebido");

          const highlightTimer = window.setTimeout(() => {
            setHighlightedAppointmentIds((currentIds) =>
              currentIds.filter((id) => id !== newAppointment.id),
            );
            highlightTimers.delete(highlightTimer);
          }, 6000);
          highlightTimers.add(highlightTimer);

          if (messageTimerRef.current) {
            window.clearTimeout(messageTimerRef.current);
          }
          messageTimerRef.current = window.setTimeout(() => {
            setRealtimeMessage("");
            messageTimerRef.current = null;
          }, 6000);

          setCurrentDateTime(new Date());
          completeFinishedAppointments([newAppointment]);

        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "appointments",
        },
        (payload) => {
          const updatedAppointment = payload.new;

          setAppointments((currentAppointments) => {
            const appointmentExists = currentAppointments.some(
              (appointment) => appointment.id === updatedAppointment.id,
            );

            return sortAppointments(
              appointmentExists
                ? currentAppointments.map((appointment) =>
                    appointment.id === updatedAppointment.id
                      ? { ...appointment, ...updatedAppointment }
                      : appointment,
                  )
                : [...currentAppointments, updatedAppointment],
            );
          });
          setCurrentDateTime(new Date());
          completeFinishedAppointments([updatedAppointment]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      highlightTimers.forEach((timer) => window.clearTimeout(timer));
      highlightTimers.clear();

      if (messageTimerRef.current) {
        window.clearTimeout(messageTimerRef.current);
      }
    };
  }, [completeFinishedAppointments]);

  const handleCreateScheduleBlock = async (newBlock) => {
    if (isSavingBlock) return false;

    setIsSavingBlock(true);
    setCreateBlockFeedback({ type: "", message: "" });

    try {
      const { data, error } = await supabase
        .from("schedule_blocks")
        .insert(newBlock)
        .select("id, block_date, start_time, end_time, all_day, reason, created_at")
        .single();

      if (error) {
        console.error("Erro ao criar bloqueio:", error);
        setCreateBlockFeedback({
          type: "error",
          message: "Não foi possível criar o bloqueio.",
        });
        return false;
      }

      setScheduleBlocks((currentBlocks) =>
        currentBlocks.some((scheduleBlock) => scheduleBlock.id === data.id)
          ? currentBlocks
          : sortScheduleBlocks([...currentBlocks, data]),
      );
      setCreateBlockFeedback({
        type: "success",
        message: "Bloqueio criado com sucesso.",
      });
      return true;
    } catch (error) {
      console.error("Erro inesperado ao criar bloqueio:", error);
      setCreateBlockFeedback({
        type: "error",
        message: "Não foi possível criar o bloqueio.",
      });
      return false;
    } finally {
      setIsSavingBlock(false);
    }
  };

  const handleRemoveScheduleBlock = async (blockId) => {
    if (removingBlockId !== null) return;

    const shouldRemove = window.confirm(
      "Tem certeza de que deseja remover este bloqueio?",
    );
    if (!shouldRemove) return;

    setRemovingBlockId(blockId);
    setRemoveBlockFeedback({ type: "", message: "" });

    try {
      const { data, error } = await supabase
        .from("schedule_blocks")
        .delete()
        .eq("id", blockId)
        .select("id");

      if (error || !data?.some((item) => item.id === blockId)) {
        if (error) console.error("Erro ao remover bloqueio:", error);
        else console.error("O Supabase não confirmou a remoção:", data);
        setRemoveBlockFeedback({
          type: "error",
          message: "Não foi possível remover o bloqueio.",
        });
        return;
      }

      setScheduleBlocks((currentBlocks) =>
        currentBlocks.filter((scheduleBlock) => scheduleBlock.id !== blockId),
      );
      setRemoveBlockFeedback({
        type: "success",
        message: "Bloqueio removido com sucesso.",
      });
    } catch (error) {
      console.error("Erro inesperado ao remover bloqueio:", error);
      setRemoveBlockFeedback({
        type: "error",
        message: "Não foi possível remover o bloqueio.",
      });
    } finally {
      setRemovingBlockId(null);
    }
  };

  const handleStatusChange = async (appointmentId, newStatus) => {
    if (
      updatingAppointmentId !== null ||
      ![APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.CANCELLED].includes(
        newStatus,
      )
    ) {
      return;
    }

    setUpdatingAppointmentId(appointmentId);
    setStatusUpdateError("");
    setStatusUpdateSuccess("");

    try {
      const { data, error } = await supabase
        .from("appointments")
        .update({ status: newStatus })
        .eq("id", appointmentId)
        .eq("status", APPOINTMENT_STATUS.PENDING)
        .select("id, status");

      if (error) {
        console.error("Erro ao atualizar status:", error);
        setStatusUpdateError("Não foi possível atualizar o status.");
        return;
      }

      const updatedAppointment = data?.find(
        (appointment) =>
          appointment.id === appointmentId && appointment.status === newStatus,
      );

      if (!updatedAppointment) {
        console.error("O Supabase não confirmou a atualização:", data);
        setStatusUpdateError("Não foi possível atualizar o status.");
        return;
      }

      setAppointments((currentAppointments) =>
        sortAppointments(
          currentAppointments.map((appointment) =>
            appointment.id === appointmentId
              ? { ...appointment, status: updatedAppointment.status }
              : appointment,
          ),
        ),
      );
      setCurrentDateTime(new Date());
      setStatusUpdateSuccess(
        newStatus === APPOINTMENT_STATUS.CONFIRMED
          ? "Agendamento confirmado com sucesso."
          : "Agendamento recusado com sucesso.",
      );
    } catch (error) {
      console.error("Erro inesperado ao atualizar status:", error);
      setStatusUpdateError("Não foi possível atualizar o status.");
    } finally {
      setUpdatingAppointmentId(null);
    }
  };

  const handleConfirmAppointment = (appointmentId) => {
    handleStatusChange(appointmentId, APPOINTMENT_STATUS.CONFIRMED);
  };

  const handleRejectAppointment = (appointmentId) => {
    const shouldReject = window.confirm(
      "Tem certeza de que deseja recusar este agendamento?",
    );

    if (shouldReject) {
      handleStatusChange(appointmentId, APPOINTMENT_STATUS.CANCELLED);
    }
  };

  const handleOpenWhatsApp = (appointment, messageType) => {
    if (!isValidBrazilianWhatsAppPhone(appointment.customer_phone)) {
      setWhatsAppError({
        appointmentId: appointment.id,
        message: "Telefone inválido para WhatsApp.",
      });
      return;
    }

    const formattedDate = formatDateBR(appointment.appointment_date);
    const formattedTime = appointment.appointment_time.slice(0, 5);
    const message =
      messageType === "confirmation"
        ? `Olá, ${appointment.customer_name}! Seu agendamento no Kallé Cortes foi confirmado.\n\nServiço(s): ${appointment.service}\nData: ${formattedDate}\nHorário: ${formattedTime}\n\nAguardamos você!`
        : `Olá, ${appointment.customer_name}! Infelizmente não foi possível confirmar seu agendamento no Kallé Cortes.\n\nServiço(s): ${appointment.service}\nData: ${formattedDate}\nHorário: ${formattedTime}\n\nEntre em contato conosco para escolher outro horário.`;

    setWhatsAppError({ appointmentId: null, message: "" });
    window.open(
      createWhatsAppUrl(appointment.customer_phone, message),
      "_blank",
      "noopener,noreferrer",
    );
  };

  const handleLogout = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    setLogoutError("");

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("Erro ao sair do painel administrativo:", error);
        setLogoutError("Não foi possível sair. Tente novamente.");
        return;
      }

      navigate("/admin/login", { replace: true });
    } catch (error) {
      console.error("Erro inesperado ao sair do painel administrativo:", error);
      setLogoutError("Não foi possível sair. Tente novamente.");
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="app-shell admin-shell">
      <header className="site-header admin-header">
        <Link className="brand notranslate" to="/" aria-label="Kallé Cortes — início" translate="no">
          <Brand />
        </Link>
        <div className="admin-header-actions">
          <Link className="admin-link" to="/">Novo agendamento</Link>
          <button
            className="admin-link admin-logout"
            type="button"
            disabled={isSigningOut}
            onClick={handleLogout}
          >
            {isSigningOut ? "Saindo..." : "Sair"}
          </button>
        </div>
      </header>

      <main id="main-content" className="admin-page">
        {logoutError && (
          <p className="admin-feedback admin-feedback--error" role="alert">
            {logoutError}
          </p>
        )}

        <div className="admin-intro">
          <p className="eyebrow">Administração</p>
          <h1>Agendamentos</h1>
          <p className="intro-text">Consulte os próximos atendimentos da barbearia.</p>
        </div>

        <div className="admin-tabs" role="tablist" aria-label="Visualização dos agendamentos">
          <button
            className={`admin-tab${activeTab === "agenda" ? " admin-tab--active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "agenda"}
            onClick={() => setActiveTab("agenda")}
          >
            Agenda ({agendaAppointments.length})
          </button>
          <button
            className={`admin-tab${activeTab === "completed" ? " admin-tab--active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "completed"}
            onClick={() => setActiveTab("completed")}
          >
            Concluídos ({completedAppointments.length})
          </button>
          <button
            className={`admin-tab${activeTab === "cancelled" ? " admin-tab--active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "cancelled"}
            onClick={() => setActiveTab("cancelled")}
          >
            Cancelados ({cancelledAppointments.length})
          </button>
          <button
            className={`admin-tab${activeTab === "blocks" ? " admin-tab--active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "blocks"}
            onClick={() => setActiveTab("blocks")}
          >
            Bloqueios ({scheduleBlocks.length})
          </button>
        </div>

        {activeTab === "blocks" ? (
          <section className="schedule-blocks-section" aria-labelledby="schedule-blocks-title">
            <div className="schedule-blocks-heading">
              <div>
                <p className="eyebrow">Disponibilidade</p>
                <h2 id="schedule-blocks-title">Bloqueios da agenda</h2>
              </div>
              <p>Bloqueie um dia inteiro ou um intervalo específico.</p>
            </div>

            <ScheduleBlockForm
              isSaving={isSavingBlock}
              feedback={createBlockFeedback}
              onCreate={handleCreateScheduleBlock}
            />

            {removeBlockFeedback.message && (
              <p
                className={`admin-feedback admin-feedback--${removeBlockFeedback.type}`}
                role={removeBlockFeedback.type === "error" ? "alert" : "status"}
              >
                {removeBlockFeedback.message}
              </p>
            )}

            {isLoadingBlocks && (
              <p className="admin-state" role="status">Carregando bloqueios...</p>
            )}
            {!isLoadingBlocks && blocksError && (
              <p className="admin-state admin-state--error" role="alert">{blocksError}</p>
            )}
            {!isLoadingBlocks && !blocksError && sortedScheduleBlocks.length === 0 && (
              <p className="admin-state">Nenhum bloqueio encontrado.</p>
            )}
            {!isLoadingBlocks && !blocksError && sortedScheduleBlocks.length > 0 && (
              <div className="schedule-block-cards" aria-label="Bloqueios existentes">
                {sortedScheduleBlocks.map((scheduleBlock) => (
                  <ScheduleBlockCard
                    key={scheduleBlock.id}
                    scheduleBlock={scheduleBlock}
                    isRemoving={removingBlockId === scheduleBlock.id}
                    onRemove={handleRemoveScheduleBlock}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
        {activeDateFilter && (
          <AdminDateFilter
            selectedDate={activeDateFilter}
            onDateChange={dateSetterByTab[activeTab]}
          />
        )}
        <section className="admin-toolbar" aria-label="Resumo da Agenda">
          <strong>Agendamentos pendentes: {pendingCount}</strong>
        </section>
        {realtimeMessage && (
          <p className="admin-realtime-notice" role="status" aria-live="polite">
            {realtimeMessage}
          </p>
        )}

        {isLoading && (
          <p className="admin-state" role="status">Carregando agendamentos...</p>
        )}

        {!isLoading && errorMessage && (
          <p className="admin-state admin-state--error" role="alert">
            {errorMessage}
          </p>
        )}

        {!isLoading && !errorMessage && visibleAppointments.length === 0 && (
          <p className="admin-state">
            {activeTab === "completed"
              ? "Não há atendimentos concluídos nesta data."
              : activeTab === "cancelled"
                ? "Não há agendamentos cancelados nesta data."
                : activeTab === "agenda"
                  ? "Não há agendamentos para esta data."
                  : "Nenhum agendamento encontrado."}
          </p>
        )}

        {statusUpdateError && (
          <p className="admin-feedback admin-feedback--error" role="alert">
            {statusUpdateError}
          </p>
        )}

        {statusUpdateSuccess && (
          <p className="admin-feedback admin-feedback--success" role="status">
            {statusUpdateSuccess}
          </p>
        )}

        {!isLoading && !errorMessage && visibleAppointments.length > 0 && (
          <section className="appointment-cards" aria-label="Agendamentos">
            {visibleAppointments.map((appointment) => {
              const appointmentDuration = getAppointmentDuration(appointment);
              const appointmentEndTime = calculateEndTime(
                appointment.appointment_time,
                appointmentDuration,
              );
              const isInProgress = isAppointmentInProgress(
                appointment,
                currentDateTime,
              );
              const isUpdating = updatingAppointmentId === appointment.id;
              const isHighlighted = highlightedAppointmentIds.includes(
                appointment.id,
              );

              return (
                <article
                  className={`admin-appointment-card${isInProgress ? " admin-appointment-card--in-progress" : ""}${appointment.status === APPOINTMENT_STATUS.COMPLETED ? " admin-appointment-card--completed" : ""}${appointment.status === APPOINTMENT_STATUS.CANCELLED ? " admin-appointment-card--cancelled" : ""}${isHighlighted ? " admin-appointment-card--new" : ""}`}
                  key={appointment.id}
                >
                  <div className="appointment-card-heading">
                    <div>
                      <span className="appointment-card-label">Cliente</span>
                      <h2>{appointment.customer_name}</h2>
                    </div>
                    <span
                      className={`status-badge ${
                        isInProgress
                          ? "status-badge--in-progress"
                          : getStatusClass(appointment.status)
                      }`}
                    >
                      {isInProgress ? "Em andamento" : translateStatus(appointment.status)}
                    </span>
                  </div>

                  <dl className="appointment-card-details">
                    <div><dt>Telefone</dt><dd>{appointment.customer_phone}</dd></div>
                    <div><dt>Serviço</dt><dd>{appointment.service}</dd></div>
                    <div><dt>Data</dt><dd>{formatDateBR(appointment.appointment_date)}</dd></div>
                    <div>
                      <dt>Horário</dt>
                      <dd>{appointment.appointment_time.slice(0, 5)} às {appointmentEndTime}</dd>
                    </div>
                    <div><dt>Duração</dt><dd>{formatDuration(appointmentDuration)}</dd></div>
                  </dl>

                  <div className="appointment-card-actions">
                    {appointment.status === APPOINTMENT_STATUS.PENDING ? (
                      <>
                        <button
                          className="appointment-action appointment-action--confirm"
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleConfirmAppointment(appointment.id)}
                        >
                          Confirmar agendamento
                        </button>
                        <button
                          className="appointment-action appointment-action--reject"
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleRejectAppointment(appointment.id)}
                        >
                          Recusar agendamento
                        </button>
                        {isUpdating && (
                          <span className="status-updating" role="status">
                            Atualizando...
                          </span>
                        )}
                      </>
                    ) : appointment.status === APPOINTMENT_STATUS.CONFIRMED ? (
                      <>
                        <p
                          className={`appointment-result ${
                            isInProgress
                              ? "appointment-result--in-progress"
                              : "appointment-result--confirmed"
                          }`}
                        >
                          {isInProgress
                            ? "Atendimento em andamento"
                            : "Agendamento confirmado"}
                        </p>
                        {!isInProgress && (
                          <button
                            className="appointment-action appointment-action--whatsapp"
                            type="button"
                            onClick={() =>
                              handleOpenWhatsApp(appointment, "confirmation")
                            }
                          >
                            Enviar confirmação pelo WhatsApp
                          </button>
                        )}
                      </>
                    ) : appointment.status === APPOINTMENT_STATUS.COMPLETED ? (
                      <p className="appointment-result appointment-result--completed">
                        Atendimento concluído
                      </p>
                    ) : appointment.status === APPOINTMENT_STATUS.CANCELLED ? (
                      <>
                        <p className="appointment-result appointment-result--cancelled">
                          Agendamento recusado
                        </p>
                        <button
                          className="appointment-action appointment-action--whatsapp"
                          type="button"
                          onClick={() => handleOpenWhatsApp(appointment, "rejection")}
                        >
                          Enviar aviso pelo WhatsApp
                        </button>
                      </>
                    ) : (
                      <p className="appointment-result">
                        Status: {translateStatus(appointment.status)}
                      </p>
                    )}
                    {whatsAppError.appointmentId === appointment.id && (
                      <p className="appointment-whatsapp-error" role="alert">
                        {whatsAppError.message}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        )}
          </>
        )}
      </main>
    </div>
  );
}

export default Admin;
