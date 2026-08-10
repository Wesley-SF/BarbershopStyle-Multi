import logoKalleCortes from "../assets/logo-kalle-cortes-horizontal.png";

function Brand({ variant }) {
  return (
    <span className={`brand-logo-frame brand-logo-frame--${variant}`}>
      <img
        className="brand-logo"
        src={logoKalleCortes}
        alt="Logo Kallé Cortes"
      />
    </span>
  );
}

export default Brand;