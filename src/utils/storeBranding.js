export const DEFAULT_STORE_BRANDING = {
  display_name: "BarbershopStyle",
  logo_url: null,
  primary_color: "#d4a84f",
  secondary_color: "#0b0b0c",
  accent_color: "#f0cf85",
  phone: null,
  instagram: null,
  address: null,
};

export function normalizeStoreBranding(store = {}) {
  const source = store ?? {};

  return {
    ...DEFAULT_STORE_BRANDING,
    ...source,
    display_name:
      source.display_name?.trim() ||
      source.name?.trim() ||
      DEFAULT_STORE_BRANDING.display_name,
  };
}

export function getStoreThemeStyle(store) {
  const branding = normalizeStoreBranding(store);

  return {
    "--color-primary": branding.primary_color,
    "--color-secondary": branding.secondary_color,
    "--color-accent": branding.accent_color,
    "--gold": branding.primary_color,
    "--gold-light": branding.accent_color,
  };
}

export function getInstagramUrl(instagram) {
  const value = String(instagram ?? "").trim();
  if (!value) return "";
  if (/^https:\/\//i.test(value)) return value;

  return `https://instagram.com/${value.replace(/^@/, "")}`;
}
