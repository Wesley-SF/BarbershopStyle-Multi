export function normalizeBrazilianPhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");

  if (!digits) return "";

  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function isValidBrazilianWhatsAppPhone(phone) {
  const normalizedPhone = normalizeBrazilianPhone(phone);

  return /^55\d{10,11}$/.test(normalizedPhone);
}

export function createWhatsAppUrl(phone, message) {
  const normalizedPhone = normalizeBrazilianPhone(phone);

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}