/** Mientras carga (§4.7): esqueletos con la forma de las tarjetas, no una pantalla en blanco. */
export default function Cargando() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Cargando">
      <div className="esqueleto h-8 w-64" />
      <div className="esqueleto h-4 w-96 max-w-full" />
      <div className="grid sm:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="esqueleto h-24" />
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="esqueleto h-14" />
      ))}
    </div>
  );
}
