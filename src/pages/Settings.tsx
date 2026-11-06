import { useEffect, useId, useRef, useState } from 'react';
import { Archive, ArrowDown, ArrowUp, Download, HardDrive, Pencil, Plus, Share, SquarePlus, Trash2, Upload } from 'lucide-react';
import { useData } from '../state/data';
import { useFeedback } from '../state/ui';
import type { Category, Settings, SortMode } from '../domain/types';
import { SWATCHES } from '../domain/types';
import * as repo from '../db/repo';
import {
  buildBackup,
  buildZipBackup,
  deliverBackup,
  deliverFile,
  zipBackupFileName,
  parseBackupFile,
  getPreImportSnapshot,
  importBackup,
  restorePreImportSnapshot,
  type ImportResult,
  type ParsedBackup,
  type PreImportSnapshot,
} from '../db/backup';
import { formatTimestamp } from '../domain/dates';
import { errorMessage } from '../hooks/useTaskActions';
import { Modal, PageHeader, SORT_LABEL } from '../components/ui';
import { ColorPicker } from './Projects';
import { Logo } from '../components/Logo';
import { AppearanceCard } from './SettingsAppearance';
import { CustomFieldsCard, TrackingCard } from './SettingsTracking';

export function SettingsPage() {
  return (
    <div className="page page-settings">
      <PageHeader eyebrow="Ajustes" title="Configuración" subtitle="Todo se guarda solo en este dispositivo." />
      <PreferencesCard />
      <AppearanceCard />
      <BackupCard />
      <CategoriesCard />
      <TrackingCard />
      <CustomFieldsCard />
      <TagsCard />
      <StorageCard />
      <InstallCard />
      <ShortcutsCard />
      <AboutCard />
    </div>
  );
}

function Card({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  const hid = useId();
  return (
    <section className="card settings-card" aria-labelledby={hid} id={id}>
      <h2 id={hid} className="card-title">
        {title}
      </h2>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function PreferencesCard() {
  const { settings } = useData();
  const { toast } = useFeedback();
  const [name, setName] = useState(settings.userName);
  useEffect(() => setName(settings.userName), [settings.userName]);

  const save = (patch: Partial<Settings>) =>
    repo.saveSettings(patch).catch((e) => toast({ message: errorMessage(e), tone: 'error' }));

  return (
    <Card title="Preferencias">
      <div className="settings-grid">
        <label className="field">
          <span className="field-label">Tu nombre (para el saludo)</span>
          <input
            value={name}
            maxLength={60}
            placeholder="Opcional"
            autoComplete="given-name"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== settings.userName && void save({ userName: name.trim() })}
          />
        </label>
        <label className="field">
          <span className="field-label">Inicio de semana</span>
          <select value={settings.weekStart} onChange={(e) => void save({ weekStart: Number(e.target.value) as 0 | 1 })}>
            <option value={1}>Lunes</option>
            <option value={0}>Domingo</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Formato horario</span>
          <select value={settings.timeFormat} onChange={(e) => void save({ timeFormat: e.target.value as '12h' | '24h' })}>
            <option value="12h">12 horas (3:30 p. m.)</option>
            <option value="24h">24 horas (15:30)</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Orden predeterminado</span>
          <select value={settings.defaultSort} onChange={(e) => void save({ defaultSort: e.target.value as SortMode })}>
            {(Object.keys(SORT_LABEL) as SortMode[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Densidad de las listas</span>
          <select value={settings.density} onChange={(e) => void save({ density: e.target.value as Settings['density'] })}>
            <option value="comfortable">Amplia</option>
            <option value="compact">Compacta</option>
          </select>
        </label>
        <div className="field">
          <span className="field-label">Tareas completadas</span>
          <label className="switch">
            <input type="checkbox" checked={settings.showCompleted} onChange={(e) => void save({ showCompleted: e.target.checked })} />
            <span className="switch-track" aria-hidden="true" />
            Mostrar en las listas
          </label>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function BackupCard() {
  const { toast, confirm } = useFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [fileName, setFileName] = useState('');
  const [importError, setImportError] = useState('');
  const [snapshot, setSnapshot] = useState<PreImportSnapshot | null>(null);
  const [lastExport, setLastExport] = useState<string | null>(null);

  const refreshSnapshot = () => void getPreImportSnapshot().then(setSnapshot).catch(() => setSnapshot(null));
  useEffect(refreshSnapshot, []);
  useEffect(() => {
    try {
      setLastExport(localStorage.getItem('tde-last-export'));
    } catch {
      /* sin acceso */
    }
  }, []);

  const doExport = async (full = false) => {
    setBusy(true);
    try {
      const backup = await buildBackup(__APP_VERSION__);
      const how = full ? await deliverFile(await buildZipBackup(__APP_VERSION__), zipBackupFileName()) : await deliverBackup(backup);
      if (how === 'cancelled') {
        toast({ message: 'Exportación cancelada' });
      } else {
        const n = backup.data.tasks.length;
        const docs = full ? ` y ${backup.data.attachments.length} documento(s)` : '';
        toast({
          message:
            how === 'shared'
              ? `Respaldo generado (${n} tareas${docs}). Elige “Guardar en Archivos” en el menú para conservarlo.`
              : `Respaldo generado (${n} tareas${docs}). Revisa tus descargas para confirmar dónde se guardó.`,
          tone: 'success',
          duration: 7000,
        });
        const ts = new Date().toISOString();
        setLastExport(ts);
        try {
          localStorage.setItem('tde-last-export', ts);
        } catch {
          /* opcional */
        }
      }
    } catch (e) {
      toast({ message: `No se pudo generar el respaldo. ${errorMessage(e)}`, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    setImportError('');
    if (!file) return;
    setFileName(file.name);
    try {
      setParsed(await parseBackupFile(file));
    } catch (e) {
      setImportError(errorMessage(e));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const restore = async () => {
    const ok = await confirm({
      title: 'Restaurar estado anterior',
      message: `Tus datos volverán a como estaban antes de la importación del ${snapshot ? formatTimestamp(snapshot.at) : ''}. Los cambios hechos después se perderán.`,
      confirmLabel: 'Restaurar',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await restorePreImportSnapshot();
      toast({ message: 'Datos restaurados', tone: 'success' });
      refreshSnapshot();
    } catch (e) {
      toast({ message: errorMessage(e), tone: 'error' });
    }
  };

  return (
    <Card title="Respaldos" id="respaldos">
      <p className="muted">
        Tus datos viven solo en este iPad. Exporta un respaldo con regularidad y guárdalo en Archivos o iCloud Drive.
        {lastExport && <> Último respaldo generado: {formatTimestamp(lastExport)}.</>}
      </p>
      <p className="muted small">
        <strong>Exportar mis datos</strong> crea un JSON con toda la información y configuración, pero sin el contenido de los documentos
        adjuntos. <strong>Respaldo completo</strong> crea un ZIP que también incluye los documentos.
      </p>
      <div className="row-wrap">
        <button type="button" className="btn btn-primary" onClick={() => void doExport()} disabled={busy}>
          <Download size={17} aria-hidden="true" /> Exportar mis datos
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => void doExport(true)} disabled={busy}>
          <Archive size={17} aria-hidden="true" /> Respaldo completo (.zip)
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => fileRef.current?.click()}>
          <Upload size={17} aria-hidden="true" /> Importar respaldo
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.zip,application/json,application/zip"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
      {importError && (
        <div className="notice notice-error" role="alert">
          <strong>No se pudo leer {fileName || 'el archivo'}.</strong> {importError}
        </div>
      )}
      {snapshot && (
        <p className="small muted">
          Se guardó una copia de tus datos antes de la última importación ({formatTimestamp(snapshot.at)}).{' '}
          <button type="button" className="btn btn-link btn-sm" onClick={() => void restore()}>
            Restaurar ese estado
          </button>
        </p>
      )}
      <ImportDialog
        parsed={parsed}
        fileName={fileName}
        onClose={() => setParsed(null)}
        onExport={doExport}
        onDone={(r) => {
          setParsed(null);
          refreshSnapshot();
          toast({
            message:
              (r.mode === 'replace'
                ? `Importación completada: se cargaron ${r.added} registros`
                : `Importación completada: ${r.added} nuevos, ${r.updated} actualizados, ${r.unchanged} sin cambios`) +
              (r.files ? ` y ${r.files} documento(s).` : '.'),
            tone: 'success',
            duration: 8000,
          });
        }}
      />
    </Card>
  );
}

function ImportDialog({
  parsed,
  fileName,
  onClose,
  onDone,
  onExport,
}: {
  parsed: ParsedBackup | null;
  fileName: string;
  onClose: () => void;
  onDone: (r: ImportResult) => void;
  onExport: () => Promise<void>;
}) {
  const { tasks, projects, categories } = useData();
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setMode('merge');
    setAck(false);
    setError('');
  }, [parsed]);

  if (!parsed) return <Modal open={false} onClose={onClose}>{null}</Modal>;
  const d = parsed.data;

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await importBackup(parsed, mode);
      onDone(r);
    } catch (e) {
      setError(`La importación se canceló y tus datos no cambiaron. ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Importar respaldo" size="md">
      <div className="form">
        <p className="muted small">
          Archivo: <strong>{fileName}</strong>
          <br />
          Exportado: {parsed.meta.exportedAt ? formatTimestamp(parsed.meta.exportedAt) : 'fecha desconocida'} · versión de la app {parsed.meta.appVersion} · formato v
          {parsed.meta.formatVersion}
        </p>
        <dl className="preview-grid">
          <div>
            <dt>Tareas</dt>
            <dd>{d.tasks.length}</dd>
          </div>
          <div>
            <dt>Completadas</dt>
            <dd>{d.tasks.filter((t) => t.status === 'completed').length}</dd>
          </div>
          <div>
            <dt>Proyectos</dt>
            <dd>{d.projects.length}</dd>
          </div>
          <div>
            <dt>Categorías</dt>
            <dd>{d.categories.length}</dd>
          </div>
          <div>
            <dt>Etiquetas</dt>
            <dd>{d.tags.length}</dd>
          </div>
          <div>
            <dt>Documentos</dt>
            <dd>{d.attachments.length}</dd>
          </div>
          <div>
            <dt>Campos personalizados</dt>
            <dd>{d.customFields.length}</dd>
          </div>
        </dl>
        {parsed.warnings.length > 0 && (
          <div className="notice">
            {parsed.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        )}

        <fieldset className="choice-group">
          <legend className="field-label">¿Cómo quieres importarlo?</legend>
          <label className={`choice${mode === 'merge' ? ' is-on' : ''}`}>
            <input type="radio" name="import-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
            <span>
              <strong>Fusionar con mis datos</strong>
              <span className="muted small">
                Añade lo nuevo y conserva lo tuyo. Si una tarea existe en ambos lados, se queda la versión modificada más recientemente.
              </span>
            </span>
          </label>
          <label className={`choice${mode === 'replace' ? ' is-on' : ''}`}>
            <input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
            <span>
              <strong>Reemplazar todo</strong>
              <span className="muted small">Sustituye tus datos actuales por los del archivo.</span>
            </span>
          </label>
        </fieldset>

        {mode === 'replace' && (
          <div className="notice notice-error">
            <p>
              <strong>Se sustituirán tus datos actuales</strong> ({tasks.length} tareas, {projects.length} proyectos, {categories.length} categorías).
              Te recomendamos exportar un respaldo antes de continuar.
            </p>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => void onExport()}>
              <Download size={15} aria-hidden="true" /> Exportar respaldo actual
            </button>
            <label className="check-line">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              Entiendo que mis datos actuales serán reemplazados.
            </label>
          </div>
        )}

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <div className="row-end">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btn ${mode === 'replace' ? 'btn-danger' : 'btn-primary'}`}
            disabled={busy || (mode === 'replace' && !ack)}
            onClick={() => void run()}
          >
            {busy ? 'Importando…' : mode === 'replace' ? 'Reemplazar mis datos' : 'Fusionar e importar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function CategoriesCard() {
  const { categories, tasks } = useData();
  const { toast } = useFeedback();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const countFor = (id: string) => tasks.filter((t) => t.categoryId === id).length;

  const move = async (i: number, dir: -1 | 1) => {
    const ids = categories.map((c) => c.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await repo.reorderCategories(ids).catch((e) => toast({ message: errorMessage(e), tone: 'error' }));
  };

  return (
    <Card title="Categorías">
      <ul className="manage-list">
        {categories.map((c, i) => (
          <li key={c.id} className="manage-item">
            <span className="dot dot-lg" style={{ background: c.color }} aria-hidden="true" />
            <span className="manage-name">{c.name}</span>
            <span className="muted small">{countFor(c.id)} tareas</span>
            <div className="manage-actions">
              <button type="button" className="icon-btn icon-btn-sm" aria-label={`Subir ${c.name}`} disabled={i === 0} onClick={() => void move(i, -1)}>
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn-sm"
                aria-label={`Bajar ${c.name}`}
                disabled={i === categories.length - 1}
                onClick={() => void move(i, 1)}
              >
                <ArrowDown size={16} />
              </button>
              <button type="button" className="icon-btn icon-btn-sm" aria-label={`Editar ${c.name}`} onClick={() => setEditing(c)}>
                <Pencil size={16} />
              </button>
              <button type="button" className="icon-btn icon-btn-sm" aria-label={`Eliminar ${c.name}`} onClick={() => setDeleting(c)}>
                <Trash2 size={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {categories.length === 0 && <p className="muted small">No hay categorías.</p>}
      <button type="button" className="btn btn-quiet" onClick={() => setEditing('new')}>
        <Plus size={16} aria-hidden="true" /> Nueva categoría
      </button>
      <CategoryForm category={editing} onClose={() => setEditing(null)} />
      <DeleteCategoryDialog category={deleting} count={deleting ? countFor(deleting.id) : 0} onClose={() => setDeleting(null)} />
    </Card>
  );
}

function CategoryForm({ category, onClose }: { category: Category | 'new' | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[1].value);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!category) return;
    setName(category === 'new' ? '' : category.name);
    setColor(category === 'new' ? SWATCHES[1].value : category.color);
    setError('');
  }, [category]);

  const submit = async () => {
    try {
      if (category === 'new') await repo.createCategory(name, color);
      else if (category) await repo.updateCategory(category.id, { name: name.trim(), color });
      toast({ message: 'Categoría guardada', tone: 'success' });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Modal open={!!category} onClose={onClose} title={category === 'new' ? 'Nueva categoría' : 'Editar categoría'} size="sm">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="field">
          <span className="field-label">Nombre</span>
          <input autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} aria-invalid={!!error} />
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <fieldset className="field">
          <legend className="field-label">Color</legend>
          <ColorPicker value={color} onChange={setColor} />
        </fieldset>
        <div className="row-end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteCategoryDialog({ category, count, onClose }: { category: Category | null; count: number; onClose: () => void }) {
  const { categories } = useData();
  const { toast } = useFeedback();
  const [target, setTarget] = useState('');
  useEffect(() => setTarget(''), [category]);
  if (!category) return <Modal open={false} onClose={onClose}>{null}</Modal>;

  const run = async () => {
    try {
      const n = await repo.deleteCategory(category.id, target || null);
      toast({ message: n ? `Categoría eliminada · ${n} tarea(s) reasignadas` : 'Categoría eliminada', tone: 'success' });
      onClose();
    } catch (e) {
      toast({ message: errorMessage(e), tone: 'error' });
    }
  };

  return (
    <Modal open onClose={onClose} title={`Eliminar “${category.name}”`} size="sm">
      <div className="form">
        <p className="confirm-text">
          {count
            ? `Esta categoría tiene ${count} tarea(s). Las tareas no se eliminarán: elige qué hacer con ellas.`
            : 'Esta categoría no tiene tareas.'}
        </p>
        {count > 0 && (
          <label className="field">
            <span className="field-label">Reasignar tareas a</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Dejarlas sin categoría</option>
              {categories
                .filter((c) => c.id !== category.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="row-end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void run()}>
            Eliminar categoría
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function TagsCard() {
  const { tags, tasks } = useData();
  const { toast, confirm } = useFeedback();
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  if (!tags.length) {
    return (
      <Card title="Etiquetas">
        <p className="muted small">Aún no hay etiquetas. Añádelas desde el detalle de cualquier tarea.</p>
      </Card>
    );
  }

  return (
    <Card title="Etiquetas">
      <ul className="manage-list">
        {tags.map((t) => {
          const n = tasks.filter((x) => x.tagIds.includes(t.id)).length;
          return (
            <li key={t.id} className="manage-item">
              <span className="tag">#{t.name}</span>
              <span className="muted small">{n} tareas</span>
              <div className="manage-actions">
                <button type="button" className="icon-btn icon-btn-sm" aria-label={`Renombrar ${t.name}`} onClick={() => setRenaming({ id: t.id, name: t.name })}>
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  aria-label={`Eliminar ${t.name}`}
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Eliminar #${t.name}`,
                      message: n ? `La etiqueta se quitará de ${n} tarea(s). Las tareas no se eliminan.` : undefined,
                      confirmLabel: 'Eliminar',
                      tone: 'danger',
                    });
                    if (ok) await repo.deleteTag(t.id).catch((e) => toast({ message: errorMessage(e), tone: 'error' }));
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Renombrar etiqueta" size="sm">
        {renaming && (
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await repo.renameTag(renaming.id, renaming.name);
                setRenaming(null);
              } catch (err) {
                toast({ message: errorMessage(err), tone: 'error' });
              }
            }}
          >
            <label className="field">
              <span className="field-label">Nombre</span>
              <input autoFocus value={renaming.name} maxLength={60} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
            </label>
            <div className="row-end">
              <button type="button" className="btn btn-ghost" onClick={() => setRenaming(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                Guardar
              </button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function StorageCard() {
  const { tasks, projects } = useData();
  const { toast } = useFeedback();
  const [estimate, setEstimate] = useState<{ usage?: number; quota?: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  const refresh = async () => {
    try {
      if (navigator.storage?.estimate) setEstimate(await navigator.storage.estimate());
      if (navigator.storage?.persisted) setPersisted(await navigator.storage.persisted());
    } catch {
      /* no compatible */
    }
  };
  useEffect(() => {
    void refresh();
  }, [tasks.length]);

  const ask = async () => {
    const r = await repo.requestPersistentStorage();
    await refresh();
    toast({
      message:
        r === true
          ? 'El navegador concedió almacenamiento persistente.'
          : r === false
            ? 'El navegador no concedió almacenamiento persistente. Mantén tus respaldos al día.'
            : 'Este navegador no permite solicitar almacenamiento persistente.',
    });
  };

  return (
    <Card title="Almacenamiento">
      <div className="storage-row">
        <HardDrive size={20} aria-hidden="true" />
        <div>
          <p>
            {tasks.length} tareas · {projects.length} proyectos guardados en IndexedDB.
          </p>
          {estimate?.usage !== undefined && (
            <p className="muted small">
              Espacio usado por la app: {formatBytes(estimate.usage)}
              {estimate.quota ? ` de ${formatBytes(estimate.quota)} disponibles` : ''}.
            </p>
          )}
          <p className="muted small">
            Almacenamiento persistente:{' '}
            {persisted === null ? 'no disponible en este navegador' : persisted ? 'concedido' : 'no concedido'}
          </p>
        </div>
      </div>
      {persisted === false && (
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => void ask()}>
          Solicitar almacenamiento persistente
        </button>
      )}
      <div className="notice">
        <p>
          <strong>Importante:</strong> los datos se guardan únicamente en este dispositivo y no están cifrados por la app. iPadOS puede
          borrar los datos de sitios web y apps de la pantalla de inicio en ciertas situaciones (por ejemplo, poco espacio, si borras los
          datos de Safari o si no se usan durante semanas). Instalar la app en la pantalla de inicio reduce ese riesgo, pero no lo elimina.
          Exporta respaldos con frecuencia.
        </p>
      </div>
    </Card>
  );
}

function InstallCard() {
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  return (
    <Card title="Instalar en tu iPad">
      {standalone ? (
        <p className="muted">Ya estás usando The Daily Edit como app instalada. ✓</p>
      ) : (
        <ol className="steps">
          <li>
            Abre esta página en <strong>Safari</strong> (no en otro navegador ni dentro de otra app).
          </li>
          <li>
            Toca el botón <strong>Compartir</strong> <Share size={15} aria-label="(icono compartir)" /> en la barra superior.
          </li>
          <li>
            Elige <strong>Añadir a pantalla de inicio</strong> <SquarePlus size={15} aria-label="(icono añadir)" />. Si no aparece, desliza
            la lista hacia abajo o toca “Editar acciones”.
          </li>
          <li>
            Confirma el nombre <strong>Daily Edit</strong> y toca <strong>Añadir</strong>.
          </li>
          <li>Abre la app desde su ícono: se abrirá a pantalla completa y funcionará sin conexión.</li>
        </ol>
      )}
    </Card>
  );
}

function ShortcutsCard() {
  const rows: [string, string][] = [
    ['N', 'Nueva tarea'],
    ['/  o  ⌘K', 'Buscar'],
    ['⌘S  o  ⌘Enter', 'Guardar y cerrar la tarea abierta'],
    ['Esc', 'Cerrar paneles y diálogos'],
    ['Alt + ↑ / ↓', 'Mover una tarea en orden manual'],
    ['G luego H / I / P / C', 'Ir a Hoy, Inbox, Proyectos o Calendario'],
  ];
  return (
    <Card title="Atajos de teclado">
      <p className="muted small">Con un teclado externo conectado al iPad.</p>
      <dl className="shortcuts">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function AboutCard() {
  return (
    <Card title="Acerca de">
      <div className="about">
        <Logo size={48} />
        <div>
          <p className="serif-name">The Daily Edit</p>
          <p className="muted small">A little space for everything that matters.</p>
          <p className="muted small">Versión {__APP_VERSION__} · esquema de datos v2</p>
        </div>
      </div>
      <p className="muted small">
        Sin cuentas, sin analítica, sin publicidad y sin servidores: tus tareas nunca salen de este dispositivo salvo que exportes un respaldo.
      </p>
    </Card>
  );
}
