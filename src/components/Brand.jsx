function Brand({ variant, displayName = "BarbershopStyle", logoUrl }) {
  return (
    <span className={`brand-logo-frame brand-logo-frame--${variant}${logoUrl ? "" : " brand-logo-frame--text"}`}>
      {logoUrl ? (
        <img className="brand-logo" src={logoUrl} alt={`Logo ${displayName}`} />
      ) : (
        <span className="brand-name">{displayName}</span>
      )}
    </span>
  );
}

export default Brand;
