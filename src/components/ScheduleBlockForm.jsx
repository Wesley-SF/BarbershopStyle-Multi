import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { formatDateBR } from "../utils/date";

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const TIME_24_HOURS_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function formatTimeInput(value) {
  const digits = value.replace(/\D/g, "").slice(0, 4);

  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
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
  labelDayButton: (date) =>
    new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(date),
};

function ScheduleBlockForm({ isSaving, feedback, onCreate }) {
  const [blockDate, setBlockDate] = useState("");
  const [selectedDate, setSelectedDate] = useState(undefined);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    if (!blockDate) {
      setValidationError("Selecione a data do bloqueio.");
      return;
    }

    if (!allDay && (!startTime || !endTime)) {
      setValidationError("Informe os horários inicial e final.");
      return;
    }

    if (
      !allDay &&
      (!TIME_24_HOURS_PATTERN.test(startTime) ||
        !TIME_24_HOURS_PATTERN.test(endTime))
    ) {
      setValidationError("Informe os horários no formato de 24 horas: HH:mm.");
      return;
    }

    if (!allDay && endTime <= startTime) {
      setValidationError("O horário final deve ser posterior ao horário inicial.");
      return;
    }

    setValidationError("");
    const wasCreated = await onCreate({
      block_date: blockDate,
      start_time: allDay ? null : startTime,
      end_time: allDay ? null : endTime,
      all_day: allDay,
      reason: reason.trim() || null,
    });

    if (wasCreated) {
      setBlockDate("");
      setSelectedDate(undefined);
      setAllDay(false);
      setStartTime("");
      setEndTime("");
      setReason("");
    }
  };

  return (
    <form className="schedule-block-form" onSubmit={handleSubmit}>
      <div className="form-field schedule-block-calendar-field">
        <p id="block-date-label">Data</p>
        <div className="calendar-container">
          <DayPicker
            mode="single"
            locale={ptBR}
            weekStartsOn={0}
            showOutsideDays
            navLayout="around"
            selected={selectedDate}
            onSelect={(date) => {
              if (!date) return;

              setSelectedDate(date);
              setBlockDate(formatLocalDate(date));
              setValidationError("");
            }}
            labels={calendarLabels}
            aria-labelledby="block-date-label"
          />
        </div>
        {blockDate && (
          <p className="selected-date" aria-live="polite">
            Data selecionada: <strong>{formatDateBR(blockDate)}</strong>
          </p>
        )}
      </div>

      <label className="schedule-block-checkbox" htmlFor="block-all-day">
        <input
          id="block-all-day"
          type="checkbox"
          checked={allDay}
          onChange={(event) => setAllDay(event.target.checked)}
        />
        Bloquear o dia inteiro
      </label>

      <div className="schedule-block-time-fields" hidden={allDay}>
        <div className="form-field">
          <label htmlFor="block-start-time">Horário inicial</label>
          <input
            id="block-start-time"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="HH:mm"
            maxLength="5"
            pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
            title="Use o formato de 24 horas: HH:mm"
            required={!allDay}
            disabled={allDay}
            value={startTime}
            onChange={(event) => setStartTime(formatTimeInput(event.target.value))}
          />
        </div>
        <div className="form-field">
          <label htmlFor="block-end-time">Horário final</label>
          <input
            id="block-end-time"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="HH:mm"
            maxLength="5"
            pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
            title="Use o formato de 24 horas: HH:mm"
            required={!allDay}
            disabled={allDay}
            value={endTime}
            onChange={(event) => setEndTime(formatTimeInput(event.target.value))}
          />
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="block-reason">Motivo (opcional)</label>
        <input
          id="block-reason"
          type="text"
          maxLength="160"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>

      {validationError && <p className="admin-feedback admin-feedback--error" role="alert">{validationError}</p>}
      {feedback.message && (
        <p
          className={`admin-feedback admin-feedback--${feedback.type}`}
          role={feedback.type === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      )}

      <button className="schedule-block-submit" type="submit" disabled={isSaving}>
        {isSaving ? "Salvando..." : "Adicionar bloqueio"}
      </button>
    </form>
  );
}

export default ScheduleBlockForm;
