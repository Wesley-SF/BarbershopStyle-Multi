import { APPOINTMENT_STATUS } from "../config/appointmentStatus.js";
import {
  BUSINESS_HOURS,
  MINIMUM_BOOKING_NOTICE_MINUTES,
  SERVICES,
  normalizeSelectedServices,
} from "../config/services.js";

const serviceDurations = new Map(
  SERVICES.map(({ name, duration }) => [name, duration]),
);
const blockingStatuses = new Set([
  APPOINTMENT_STATUS.PENDING,
  APPOINTMENT_STATUS.CONFIRMED,
]);
const legacyCombinedServices = new Set(["Corte + Barba", "Corte+Barba"]);

export function getBusinessHoursForDate(date) {
  let localDate;

  if (date instanceof Date) {
    localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  } else {
    const [year, month, day] = String(date).split("-").map(Number);
    localDate = new Date(year, month - 1, day);

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      !Number.isInteger(day) ||
      localDate.getFullYear() !== year ||
      localDate.getMonth() !== month - 1 ||
      localDate.getDate() !== day
    ) {
      return null;
    }
  }

  if (Number.isNaN(localDate.getTime())) {
    return null;
  }

  return BUSINESS_HOURS[localDate.getDay()] ?? null;
}
export function timeToMinutes(time) {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function isSameLocalDate(dateString, date) {
  const [year, month, day] = String(dateString).split("-").map(Number);

  return (
    year === date.getFullYear() &&
    month === date.getMonth() + 1 &&
    day === date.getDate()
  );
}

export function getCurrentMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

export function roundUpToInterval(minutes, interval) {
  return Math.ceil(minutes / interval) * interval;
}

export function getMinimumBookingStartMinutes(
  dateString,
  currentDateTime = new Date(),
) {
  if (!isSameLocalDate(dateString, currentDateTime)) {
    return null;
  }

  return roundUpToInterval(
    getCurrentMinutes(currentDateTime) + MINIMUM_BOOKING_NOTICE_MINUTES,
    BUSINESS_HOURS.slotInterval,
  );
}

export function isSlotAllowedByCurrentTime(
  dateString,
  startTime,
  currentDateTime = new Date(),
) {
  const minimumStart = getMinimumBookingStartMinutes(
    dateString,
    currentDateTime,
  );

  return minimumStart === null || timeToMinutes(startTime) >= minimumStart;
}

export function formatDuration(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}min`;
  }

  return minutes === 0 ? `${hours}h` : `${hours}h${minutes}min`;
}

export function calculateTotalDuration(selectedServices) {
  return normalizeSelectedServices(selectedServices).reduce(
    (total, serviceName) => total + (serviceDurations.get(serviceName) ?? 0),
    0,
  );
}

export function calculateEndTime(startTime, durationMinutes) {
  return minutesToTime(timeToMinutes(startTime) + durationMinutes);
}

export function hasTimeOverlap(
  newStart,
  newEnd,
  appointmentStart,
  appointmentEnd,
) {
  return newStart < appointmentEnd && newEnd > appointmentStart;
}

export function isIntervalBlocked(newStart, newEnd, scheduleBlocks = []) {
  return scheduleBlocks.some((scheduleBlock) => {
    if (scheduleBlock.all_day) {
      return true;
    }

    if (!scheduleBlock.start_time || !scheduleBlock.end_time) {
      return false;
    }

    const blockStart = timeToMinutes(scheduleBlock.start_time);
    const blockEnd = timeToMinutes(scheduleBlock.end_time);

    return hasTimeOverlap(newStart, newEnd, blockStart, blockEnd);
  });
}

export function getAppointmentDuration(appointment) {
  const storedDuration = Number(appointment.duration_minutes);

  if (Number.isFinite(storedDuration) && storedDuration > 0) {
    return storedDuration;
  }

  const savedServices = String(appointment.service ?? "")
    .split(",")
    .map((service) => service.trim())
    .filter(Boolean);

  if (
    savedServices.length === 1 &&
    legacyCombinedServices.has(savedServices[0])
  ) {
    return 60;
  }

  if (
    savedServices.length === 0 ||
    savedServices.some((service) => !serviceDurations.has(service))
  ) {
    return 60;
  }

  return calculateTotalDuration(savedServices);
}

export function getAppointmentStartDateTime(appointment) {
  const [year, month, day] = String(appointment.appointment_date)
    .split("-")
    .map(Number);
  const [hour, minute] = String(appointment.appointment_time)
    .split(":")
    .slice(0, 2)
    .map(Number);
  const values = [year, month, day, hour, minute];

  if (values.some((value) => !Number.isInteger(value))) {
    console.error("Dados inválidos para calcular término:", { appointment });
    return null;
  }

  const startDateTime = new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    0,
    0,
  );
  const hasValidComponents =
    startDateTime.getFullYear() === year &&
    startDateTime.getMonth() === month - 1 &&
    startDateTime.getDate() === day &&
    startDateTime.getHours() === hour &&
    startDateTime.getMinutes() === minute;

  if (!hasValidComponents) {
    console.error("Dados inválidos para calcular término:", { appointment });
    return null;
  }

  return startDateTime;
}

export function getAppointmentEndDateTime(appointment) {
  const startDateTime = getAppointmentStartDateTime(appointment);
  const durationMinutes = getAppointmentDuration(appointment);

  if (!startDateTime || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    console.error("Dados inválidos para calcular término:", { appointment });
    return null;
  }

  return new Date(startDateTime.getTime() + durationMinutes * 60 * 1000);
}

export function isAppointmentFinished(appointment, currentDateTime = new Date()) {
  if (appointment.status !== APPOINTMENT_STATUS.CONFIRMED) {
    return false;
  }

  const endDateTime = getAppointmentEndDateTime(appointment);
  const currentTimestamp = currentDateTime.getTime();

  return Boolean(
    endDateTime &&
    Number.isFinite(currentTimestamp) &&
    endDateTime.getTime() <= currentTimestamp,
  );
}

export function isAppointmentInProgress(
  appointment,
  currentDateTime = new Date(),
) {
  if (appointment.status !== APPOINTMENT_STATUS.CONFIRMED) {
    return false;
  }

  const startDateTime = getAppointmentStartDateTime(appointment);
  const endDateTime = getAppointmentEndDateTime(appointment);
  const currentTimestamp = currentDateTime.getTime();

  return Boolean(
    startDateTime &&
    endDateTime &&
    Number.isFinite(currentTimestamp) &&
    startDateTime.getTime() <= currentTimestamp &&
    endDateTime.getTime() > currentTimestamp,
  );
}
export function isTimeAvailable(
  date,
  startTime,
  durationMinutes,
  appointments,
  scheduleBlocks = [],
  currentDateTime = new Date(),
) {
  const businessHours = getBusinessHoursForDate(date);

  if (!businessHours) {
    return false;
  }

  const newStart = timeToMinutes(startTime);
  const newEnd = newStart + durationMinutes;
  const opening = timeToMinutes(businessHours.start);
  const closing = timeToMinutes(businessHours.end);

  if (newStart < opening || newEnd > closing) {
    return false;
  }

  if (!isSlotAllowedByCurrentTime(date, startTime, currentDateTime)) {
    return false;
  }

  if (isIntervalBlocked(newStart, newEnd, scheduleBlocks)) {
    return false;
  }

  return !appointments.some((appointment) => {
    if (!blockingStatuses.has(appointment.status)) {
      return false;
    }

    const appointmentStart = timeToMinutes(appointment.appointment_time);
    const appointmentEnd =
      appointmentStart + getAppointmentDuration(appointment);

    return hasTimeOverlap(
      newStart,
      newEnd,
      appointmentStart,
      appointmentEnd,
    );
  });
}

export function generateAvailableSlots(
  date,
  durationMinutes,
  appointments = [],
  scheduleBlocks = [],
  currentDateTime = new Date(),
) {
  const businessHours = getBusinessHoursForDate(date);

  if (!businessHours || !durationMinutes) {
    return [];
  }

  const opening = timeToMinutes(businessHours.start);
  const closing = timeToMinutes(businessHours.end);
  const slots = [];

  for (
    let slotStart = opening;
    slotStart + durationMinutes <= closing;
    slotStart += BUSINESS_HOURS.slotInterval
  ) {
    const time = minutesToTime(slotStart);

    if (
      isTimeAvailable(
        date,
        time,
        durationMinutes,
        appointments,
        scheduleBlocks,
        currentDateTime,
      )
    ) {
      slots.push(time);
    }
  }

  return slots;
}