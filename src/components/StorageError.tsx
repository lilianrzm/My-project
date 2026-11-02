import { Logo } from './Logo';

/** Pantalla cuando IndexedDB no está disponible (p. ej. navegación privada o almacenamiento bloqueado). */
export function StorageError({ error }: { error: unknown }) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return (
    <div className="fatal" role="alert">
      <Logo size={56} />
      <h1 className="display">No se pudo abrir tu espacio</h1>
      <p>
        The Daily Edit guarda tus datos en el almacenamiento local del navegador (IndexedDB) y en este momento no está disponible.
      </p>
      <ul>
        <li>Si usas la navegación privada de Safari, ábrela en una pestaña normal.</li>
        <li>Revisa que haya espacio libre en el iPad.</li>
        <li>Comprueba en Ajustes › Safari › Avanzado que los datos de sitios web no estén bloqueados.</li>
      </ul>
      <p>Tus datos guardados anteriormente no se han modificado.</p>
      <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
        Reintentar
      </button>
      <details>
        <summary>Detalle técnico</summary>
        <code>{detail}</code>
      </details>
    </div>
  );
}
