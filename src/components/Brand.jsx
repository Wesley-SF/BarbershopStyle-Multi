import { useState } from "react";

const logoModules = import.meta.glob("../assets/logo-kalle-cortes.png", {
  eager: true,
  query: "?url",
  import: "default",
});
const logoSrc = logoModules["../assets/logo-kalle-cortes.png"];

function Brand() {
  const [hasImageError, setHasImageError] = useState(false);

  if (logoSrc && !hasImageError) {
    return (
      <img
        className="brand-logo"
        src={logoSrc}
        alt="Logo Kallé Cortes"
        onError={() => setHasImageError(true)}
      />
    );
  }

  return (
    <span className="brand-fallback" aria-label="Kallé Cortes">
      <span className="brand-mark" aria-hidden="true">K</span>
      <span>Kallé Cortes</span>
    </span>
  );
}

export default Brand;