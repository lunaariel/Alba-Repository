/** Ícono del emblema de Albor (disco, anillo, media luna y estrella) para encabezado y pie. */
export function IconoAlbor({ tamano = 40, negativo = false }: { tamano?: number; negativo?: boolean }) {
  const fondo = negativo ? '#F8F5EE' : '#4E6049';
  const figura = negativo ? '#443D34' : '#E9DFC9';
  const id = negativo ? 'albor-mascara-neg' : 'albor-mascara';
  return (
    <svg aria-hidden="true" width={tamano} height={tamano} viewBox="34 34 132 132">
      <defs>
        <mask id={id}>
          <rect width="200" height="200" fill="#fff" />
          <circle cx="116" cy="94" r="35" fill="#000" />
        </mask>
      </defs>
      <circle cx="100" cy="100" r="64" fill={fondo} />
      {!negativo && <circle cx="100" cy="100" r="54" fill="none" stroke={figura} strokeWidth="5" />}
      <circle cx="100" cy="100" r="42" fill={figura} mask={`url(#${id})`} />
      {!negativo && (
        <path
          fill={figura}
          d="M112 79 L113.53 96.3 L119.07 92.93 L115.7 98.47 L133 100 L115.7 101.53 L119.07 107.07 L113.53 103.7 L112 121 L110.47 103.7 L104.93 107.07 L108.3 101.53 L91 100 L108.3 98.47 L104.93 92.93 L110.47 96.3 Z"
        />
      )}
    </svg>
  );
}
