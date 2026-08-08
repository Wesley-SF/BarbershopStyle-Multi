import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import "react-day-picker/style.css";
import {
  addDaysToDate,
  formatDateBR,
  formatDateForDatabase,
  getLocalToday,
  parseDatabaseDate,
} from "../utils/date";

function AdminDateFilter({ selectedDate, onDateChange }) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const handleDateSelect = (date) => {
    if (!date) return;

    onDateChange(formatDateForDatabase(date));
    setIsCalendarOpen(false);
  };

  const handleDayChange = (days) => {
    onDateChange(addDaysToDate(selectedDate, days));
  };

  const handleToday = () => {
    onDateChange(getLocalToday());
    setIsCalendarOpen(false);
  };

  return (
    <section className="admin-agenda-filter" aria-labelledby="admin-date-filter-title">
      <div className="admin-agenda-filter-heading">
        <div>
          <span id="admin-date-filter-title" className="appointment-card-label">
            Data selecionada
          </span>
          <strong>{formatDateBR(selectedDate)}</strong>
        </div>
        <button
          className="admin-date-button admin-date-button--today"
          type="button"
          onClick={handleToday}
        >
          Hoje
        </button>
      </div>

      <div className="admin-date-navigation" aria-label="Navegação entre dias">
        <button
          className="admin-date-button"
          type="button"
          onClick={() => handleDayChange(-1)}
        >
          Dia anterior
        </button>
        <button
          className="admin-date-button"
          type="button"
          aria-expanded={isCalendarOpen}
          aria-controls="admin-date-filter-calendar"
          onClick={() => setIsCalendarOpen((isOpen) => !isOpen)}
        >
          Escolher data
        </button>
        <button
          className="admin-date-button"
          type="button"
          onClick={() => handleDayChange(1)}
        >
          Próximo dia
        </button>
      </div>

      {isCalendarOpen && (
        <div
          id="admin-date-filter-calendar"
          className="calendar-container admin-agenda-calendar"
        >
          <DayPicker
            mode="single"
            locale={ptBR}
            weekStartsOn={0}
            showOutsideDays
            navLayout="around"
            selected={parseDatabaseDate(selectedDate)}
            onSelect={handleDateSelect}
            aria-label="Selecionar data"
          />
        </div>
      )}
    </section>
  );
}

export default AdminDateFilter;
