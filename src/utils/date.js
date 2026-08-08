export function formatDateBR(dateString) {
  const [year, month, day] = String(dateString ?? "").split("-");

  if (!year || !month || !day) {
    return "";
  }

  return `${day}/${month}/${year}`;
}

export function formatDateForDatabase(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getLocalToday() {
  return formatDateForDatabase(new Date());
}

export function parseDatabaseDate(dateString) {
  const [year, month, day] = String(dateString ?? "").split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return date;
}

export function addDaysToDate(dateString, days) {
  const date = parseDatabaseDate(dateString);
  if (!date) return dateString;

  date.setDate(date.getDate() + days);
  return formatDateForDatabase(date);
}

export function isSameAppointmentDate(appointment, dateString) {
  return appointment.appointment_date === dateString;
}
