import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { CloudOff, RefreshCw, X } from 'lucide-react';

/**
 * Estado de la PWA:
 * - Aviso discreto cuando no hay conexión (la app sigue funcionando).
 * - Aviso cuando hay una versión nueva. La actualización NO se aplica sola:
 *   el usuario decide cuándo recargar, así nunca se interrumpe una edición.
 *   Los datos están en IndexedDB, que no se toca al actualizar la caché de la app.
 */
export function PwaStatus() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [dismissedOffline, setDismissedOffline] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Comprobar actualizaciones al volver a la app y cada hora
      if (!reg) return;
      const check = () => {
        if (navigator.onLine && document.visibilityState === 'visible') void reg.update().catch(() => undefined);
      };
      document.addEventListener('visibilitychange', check);
      window.setInterval(check, 60 * 60 * 1000);
    },
    onRegisterError() {
      /* sin service worker (p. ej. http en desarrollo): la app funciona igualmente en línea */
    },
  });

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => {
      setOnline(false);
      setDismissedOffline(false);
    };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return (
    <div className="pwa-status" aria-live="polite">
      {!online && !dismissedOffline && (
        <div className="banner banner-offline" role="status">
          <CloudOff size={16} aria-hidden="true" />
          <span>Sin conexión. Todo sigue funcionando y se guarda en este iPad.</span>
          <button type="button" className="icon-btn icon-btn-sm" aria-label="Ocultar aviso" onClick={() => setDismissedOffline(true)}>
            <X size={14} />
          </button>
        </div>
      )}
      {needRefresh && (
        <div className="banner banner-update" role="status">
          <RefreshCw size={16} aria-hidden="true" />
          <span>Hay una nueva versión de The Daily Edit.</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void updateServiceWorker(true)}>
            Actualizar
          </button>
          <button type="button" className="icon-btn icon-btn-sm" aria-label="Más tarde" onClick={() => setNeedRefresh(false)}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
