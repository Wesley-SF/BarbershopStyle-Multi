export const SERVICES = [
  { name: "Corte", duration: 40 },
  { name: "Barba", duration: 20 },
  { name: "Pezinho", duration: 10 },
  { name: "Bigode", duration: 10 },
  { name: "Cavanhaque", duration: 15 },
  { name: "Sobrancelha", duration: 10 },
  { name: "Alisamento", duration: 90 },
  { name: "Luzes", duration: 120 },
  { name: "Nevou", duration: 120 },
  { name: "Pigmentação", duration: 30 },
  { name: "Frisado", duration: 90 },
];

export const INCLUDED_SERVICES = {
  Nevou: ["Corte", "Sobrancelha", "Pezinho"],
  Barba: ["Cavanhaque", "Bigode"],
  Corte: ["Pezinho"],
};

export function normalizeSelectedServices(selectedServices = []) {
  const uniqueServices = [...new Set(selectedServices)];
  const includedServices = new Set(
    uniqueServices.flatMap((service) => INCLUDED_SERVICES[service] ?? []),
  );

  return uniqueServices.filter((service) => !includedServices.has(service));
}

export function getIncludingService(service, selectedServices = []) {
  return selectedServices.find((selectedService) =>
    INCLUDED_SERVICES[selectedService]?.includes(service),
  );
}

export const BUSINESS_HOURS = {
  0: { start: "09:00", end: "11:00" },
  1: { start: "08:00", end: "18:00" },
  2: { start: "08:00", end: "18:00" },
  3: { start: "08:00", end: "18:00" },
  4: { start: "08:00", end: "18:00" },
  5: { start: "08:00", end: "18:00" },
  6: { start: "09:00", end: "18:00" },
  slotInterval: 10,
};

export const MINIMUM_BOOKING_NOTICE_MINUTES = 30;
