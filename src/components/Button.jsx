function Button({ texto, onClick, disabled = false, ariaPressed, variant = "primary" }) {
  return (
    <button
      className={`button button--${variant}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={ariaPressed}
    >
      {texto}
    </button>
  );
}

export default Button;
