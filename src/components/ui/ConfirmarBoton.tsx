"use client";

/** Botón de envío que pide confirmación antes de una operación importante o difícil de deshacer. */
export function ConfirmarBoton({
  mensaje,
  children,
  className = "btn",
  disabled,
  title,
}: {
  mensaje: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      title={title}
      className={className}
      onClick={(e) => {
        if (!window.confirm(mensaje)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
