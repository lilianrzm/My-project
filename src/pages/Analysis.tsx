import { useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, Columns3, FileSpreadsheet, Info, Search, SlidersHorizontal, X } from 'lucide-react';
import { db } from '../db/db';
import * as repo from '../db/repo';
import { deliverFile } from '../db/backup';
import { useData } from '../state/data';
import { useFeedback, useUI } from '../state/ui';
import {
  EMPTY_ANALYTICS_FILTER,
  computeMetrics,
  presetPeriod,
  recordSet,
  type AnalyticsFilter,
  type DateBasis,
  type Metrics,
  type PeriodPreset,
} from '../domain/analytics';
import { allColumns, displayCell, sortKey, type RecordContext } from '../domain/records';
import { buildActivitiesWorkbook } from '../export/excel';
import { XLSX_MIME } from '../export/xlsx';
import { normalizeText } from '../domain/selectors';
import { formatDayMonthYear } from '../domain/dates';
import type { Priority, TaskStatus } from '../domain/types';
import { PRIORITY_LABEL, STATUS_LABEL } from '../domain/types';
import { errorMessage } from '../hooks/useTaskActions';
import { BarList, TrendChart } from '../components/Charts';
import { Modal, PageHeader } from '../components/ui';

/* ------------------------------------------------------------------ */
/* Indicadores disponibles                                              */
/* ------------------------------------------------------------------ */

type Widget = { id: string; title: string; kind: 'kpi' | 'chart'; help: string };

const WIDGETS: Widget[] = [
  { id: 'created', title: 'Actividades creadas', kind: 'kpi', help: 'Actividades principales con fecha de creación en el periodo.' },
  { id: 'completed', title: 'Actividades completadas', kind: 'kpi', help: 'Actividades principales con fecha de conclusión en el periodo. No incluye canceladas ni subtareas.' },
  { id: 'pending', title: 'Pendientes', kind: 'kpi', help: 'Actividades principales pendientes hoy (no depende del periodo).' },
  { id: 'overdue', title: 'Vencidas', kind: 'kpi', help: 'Pendientes con vencimiento anterior a hoy (no depende del periodo).' },
  { id: 'onTime', title: 'Cumplimiento de plazos', kind: 'kpi', help: 'Concluidas con fecha de conclusión ≤ vencimiento ÷ concluidas con vencimiento y conclusión válidos × 100.' },
  { id: 'avgTime', title: 'Tiempo promedio de atención', kind: 'kpi', help: 'Σ días calendario de la creación a la conclusión ÷ nº de concluidas con fechas válidas. No son horas trabajadas.' },
  { id: 'subtasksDone', title: 'Subtareas ejecutadas', kind: 'kpi', help: 'Subtareas completadas en el periodo. Son acciones operativas, no actividades.' },
  { id: 'avgSubtasks', title: 'Subtareas por actividad', kind: 'kpi', help: 'Nº de subtareas ÷ nº de actividades principales del conjunto de registros (según la fecha de referencia).' },
  { id: 'byPeriod', title: 'Evolución por periodo', kind: 'chart', help: 'Creadas (por fecha de creación) y completadas (por fecha de conclusión), por semana o mes.' },
  { id: 'byCategory', title: 'Completadas por categoría', kind: 'chart', help: 'Actividades concluidas en el periodo, agrupadas por categoría.' },
  { id: 'byProject', title: 'Completadas por proyecto', kind: 'chart', help: 'Actividades concluidas en el periodo, agrupadas por proyecto.' },
  { id: 'byResult', title: 'Distribución por resultado', kind: 'chart', help: 'Actividades concluidas en el periodo según su resultado de atención.' },
];

const PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'thisMonth', label: 'Este mes' },
  { id: 'thisWeek', label: 'Esta semana' },
  { id: 'last30', label: 'Últimos 30 días' },
  { id: 'last90', label: 'Últimos 90 días' },
  { id: 'thisYear', label: 'Este año' },
  { id: 'all', label: 'Todo el historial' },
  { id: 'custom', label: 'Personalizado' },
];

const BASIS_LABEL: Record<DateBasis, string> = { created: 'Fecha de creación', concluded: 'Fecha de conclusión', due: 'Fecha de vencimiento' };

function orderedWidgets(order: string[]): Widget[] {
  const known = order.map((id) => WIDGETS.find((w) => w.id === id)).filter((w): w is Widget => !!w);
  return [...known, ...WIDGETS.filter((w) => !order.includes(w.id))];
}

export function AnalysisPage() {
  const { tasks, settings, categories, projects, customFields, categoryById, projectById, tagById } = useData();
  const { today, selectTask } = useUI();
  const { toast } = useFeedback();
  const [preset, setPreset] = useState<PeriodPreset>('thisMonth');
  const [filter, setFilter] = useState<AnalyticsFilter>(() => ({ ...EMPTY_ANALYTICS_FILTER, period: presetPeriod('thisMonth', today, settings.weekStart) }));
  const [customizing, setCustomizing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const attachments = useLiveQuery(() => db.attachments.toArray(), []) ?? [];

  const attachmentCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of attachments) m.set(a.taskId, (m.get(a.taskId) ?? 0) + 1);
    return m;
  }, [attachments]);

  const lookups = useMemo(
    () => ({
      categoryName: (id: string) => categoryById.get(id)?.name,
      projectName: (id: string) => projectById.get(id)?.name,
      resultName: (id: string) => settings.closureResults.find((o) => o.id === id)?.label,
    }),
    [categoryById, projectById, settings.closureResults],
  );

  const metrics = useMemo(() => computeMetrics(tasks, filter, today, settings.weekStart, lookups), [tasks, filter, today, settings.weekStart, lookups]);
  const records = useMemo(() => recordSet(tasks, filter), [tasks, filter]);

  const ctx: RecordContext = useMemo(
    () => ({ today, categoryById, projectById, tagById, results: settings.closureResults, attentionTypes: settings.attentionTypes, customFields, attachmentCount }),
    [today, categoryById, projectById, tagById, settings.closureResults, settings.attentionTypes, customFields, attachmentCount],
  );

  const layout = settings.analytics;
  const widgets = orderedWidgets(layout.order);
  const visible = widgets.filter((w) => !layout.hidden.includes(w.id));

  const saveLayout = (patch: Partial<typeof layout>) => void repo.saveSettings({ analytics: { ...layout, ...patch } });
  const moveWidget = (id: string, dir: -1 | 1) => {
    const ids = widgets.map((w) => w.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    saveLayout({ order: ids });
  };

  const responsibles = useMemo(() => [...new Set(tasks.map((t) => (t.closure?.responsible || t.responsible || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es-MX')), [tasks]);
  const filterableFields = customFields.filter((f) => f.type === 'select' || f.type === 'multiselect' || f.type === 'checkbox');

  const filterSummary = (): [string, string][] => {
    const out: [string, string][] = [];
    const p = filter.period;
    out.push(['Periodo', p.from || p.to ? `${p.from ? formatDayMonthYear(p.from) : 'inicio'} – ${p.to ? formatDayMonthYear(p.to) : 'hoy'}` : 'Todo el historial']);
    out.push(['Fecha de referencia de los registros', BASIS_LABEL[filter.basis]]);
    if (filter.categoryId !== 'any') out.push(['Categoría', filter.categoryId === 'none' ? 'Sin categoría' : categoryById.get(filter.categoryId)?.name ?? '']);
    if (filter.projectId !== 'any') out.push(['Proyecto', filter.projectId === 'none' ? 'Sin proyecto' : projectById.get(filter.projectId)?.name ?? '']);
    if (filter.status !== 'any') out.push(['Estado', STATUS_LABEL[filter.status]]);
    if (filter.priority !== 'any') out.push(['Prioridad', PRIORITY_LABEL[filter.priority]]);
    if (filter.responsible !== 'any') out.push(['Responsable', filter.responsible || 'Sin responsable']);
    if (filter.resultId !== 'any') out.push(['Resultado', filter.resultId === 'none' ? 'Sin resultado' : settings.closureResults.find((o) => o.id === filter.resultId)?.label ?? '']);
    if (filter.custom) {
      const f = customFields.find((x) => x.id === filter.custom!.fieldId);
      const v = filter.custom.value;
      out.push([f?.name ?? 'Campo', v === 'true' ? 'Sí' : v === 'false' ? 'No' : v === '__empty' ? 'Sin valor' : f?.options.find((o) => o.id === v)?.label ?? v]);
    }
    return out;
  };

  const doExport = async (scope: 'filtered' | 'all') => {
    try {
      const list = scope === 'filtered' ? records : tasks;
      const m = scope === 'filtered' ? metrics : computeMetrics(tasks, EMPTY_ANALYTICS_FILTER, today, settings.weekStart, lookups);
      const bytes = buildActivitiesWorkbook(list, ctx, { metrics: m, filters: scope === 'filtered' ? filterSummary() : [['Periodo', 'Todo el historial']], scope });
      const how = await deliverFile(new Blob([bytes as BlobPart], { type: XLSX_MIME }), `the-daily-edit-actividades-${today}.xlsx`);
      setExporting(false);
      if (how !== 'cancelled') toast({ message: `Excel generado con ${list.length} actividad(es).`, tone: 'success' });
    } catch (e) {
      toast({ message: `No se pudo generar el Excel. ${errorMessage(e)}`, tone: 'error' });
    }
  };

  const set = (patch: Partial<AnalyticsFilter>) => setFilter((f) => ({ ...f, ...patch }));

  return (
    <div className="page page-wide page-analysis">
      <PageHeader
        eyebrow="Seguimiento"
        title="Análisis"
        subtitle="Indicadores de tus actividades principales. Las subtareas se cuentan aparte."
        actions={
          <>
            <button type="button" className={`btn btn-quiet${customizing ? ' is-active' : ''}`} aria-pressed={customizing} onClick={() => setCustomizing((v) => !v)}>
              <SlidersHorizontal size={16} aria-hidden="true" /> Personalizar
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setExporting(true)}>
              <FileSpreadsheet size={16} aria-hidden="true" /> Exportar a Excel
            </button>
          </>
        }
      />

      <div className="an-filters card" role="search" aria-label="Filtros de análisis">
        <label className="field-inline">
          <span>Periodo</span>
          <select
            value={preset}
            onChange={(e) => {
              const p = e.target.value as PeriodPreset;
              setPreset(p);
              if (p !== 'custom') set({ period: presetPeriod(p, today, settings.weekStart) });
            }}
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {preset === 'custom' && (
          <>
            <label className="field-inline">
              <span>Desde</span>
              <input type="date" value={filter.period.from ?? ''} onChange={(e) => set({ period: { ...filter.period, from: e.target.value || null } })} />
            </label>
            <label className="field-inline">
              <span>Hasta</span>
              <input type="date" value={filter.period.to ?? ''} onChange={(e) => set({ period: { ...filter.period, to: e.target.value || null } })} />
            </label>
          </>
        )}
        <label className="field-inline">
          <span>Categoría</span>
          <select value={filter.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
            <option value="any">Todas</option>
            <option value="none">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-inline">
          <span>Proyecto</span>
          <select value={filter.projectId} onChange={(e) => set({ projectId: e.target.value })}>
            <option value="any">Todos</option>
            <option value="none">Sin proyecto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-inline">
          <span>Estado</span>
          <select value={filter.status} onChange={(e) => set({ status: e.target.value as TaskStatus | 'any' })}>
            <option value="any">Todos</option>
            {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field-inline">
          <span>Prioridad</span>
          <select value={String(filter.priority)} onChange={(e) => set({ priority: e.target.value === 'any' ? 'any' : (Number(e.target.value) as Priority) })}>
            <option value="any">Todas</option>
            {[3, 2, 1, 0].map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p as Priority]}
              </option>
            ))}
          </select>
        </label>
        <label className="field-inline">
          <span>Responsable</span>
          <select value={filter.responsible} onChange={(e) => set({ responsible: e.target.value })}>
            <option value="any">Todos</option>
            <option value="">Sin responsable</option>
            {responsibles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="field-inline">
          <span>Resultado</span>
          <select value={filter.resultId} onChange={(e) => set({ resultId: e.target.value })}>
            <option value="any">Todos</option>
            <option value="none">Sin resultado</option>
            {settings.closureResults.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {filterableFields.length > 0 && (
          <label className="field-inline">
            <span>Campo</span>
            <select
              value={filter.custom ? `${filter.custom.fieldId}|${filter.custom.value}` : ''}
              onChange={(e) => {
                const [fieldId, value] = e.target.value.split('|');
                set({ custom: fieldId ? { fieldId, value } : null });
              }}
            >
              <option value="">Cualquier valor</option>
              {filterableFields.map((f) => (
                <optgroup key={f.id} label={f.name}>
                  {f.type === 'checkbox' ? (
                    <>
                      <option value={`${f.id}|true`}>Sí</option>
                      <option value={`${f.id}|false`}>No</option>
                    </>
                  ) : (
                    <>
                      {f.options.map((o) => (
                        <option key={o.id} value={`${f.id}|${o.id}`}>
                          {o.label}
                        </option>
                      ))}
                      <option value={`${f.id}|__empty`}>Sin valor</option>
                    </>
                  )}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="btn btn-link btn-sm"
          onClick={() => {
            setPreset('thisMonth');
            setFilter({ ...EMPTY_ANALYTICS_FILTER, period: presetPeriod('thisMonth', today, settings.weekStart) });
          }}
        >
          Restablecer filtros
        </button>
      </div>

      {customizing && (
        <div className="card an-customize">
          <p className="small muted">Elige qué indicadores mostrar y su orden. Se guarda en este dispositivo y viaja en tus respaldos.</p>
          <ul className="manage-list">
            {widgets.map((w, i) => (
              <li key={w.id} className="manage-item">
                <label className="check-line check-line-olive manage-name">
                  <input
                    type="checkbox"
                    checked={!layout.hidden.includes(w.id)}
                    onChange={(e) => saveLayout({ hidden: e.target.checked ? layout.hidden.filter((x) => x !== w.id) : [...layout.hidden, w.id] })}
                  />
                  {w.title}
                </label>
                <div className="manage-actions">
                  <button type="button" className="icon-btn icon-btn-sm" aria-label={`Subir ${w.title}`} disabled={i === 0} onClick={() => moveWidget(w.id, -1)}>
                    <ArrowUp size={16} />
                  </button>
                  <button type="button" className="icon-btn icon-btn-sm" aria-label={`Bajar ${w.title}`} disabled={i === widgets.length - 1} onClick={() => moveWidget(w.id, 1)}>
                    <ArrowDown size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-link btn-sm" onClick={() => saveLayout({ order: [], hidden: [] })}>
            Restablecer indicadores
          </button>
        </div>
      )}

      <div className="kpi-grid">
        {visible
          .filter((w) => w.kind === 'kpi')
          .map((w) => (
            <Kpi key={w.id} widget={w} metrics={metrics} />
          ))}
      </div>
      <div className="chart-grid">
        {visible
          .filter((w) => w.kind === 'chart')
          .map((w) => (
            <ChartCard key={w.id} widget={w} metrics={metrics} />
          ))}
      </div>

      <RecordsTable records={records} ctx={ctx} basis={filter.basis} onBasis={(basis) => set({ basis })} onOpen={(id) => selectTask(id)} />

      <Modal open={exporting} onClose={() => setExporting(false)} title="Exportar a Excel" size="sm">
        <p className="confirm-text">
          Se genera un archivo .xlsx con tres hojas: <strong>Actividades</strong> (una fila por actividad principal), <strong>Subtareas</strong> (vinculadas por
          el ID de su actividad) y <strong>Resumen</strong> (indicadores y filtros). No incluye los documentos adjuntos.
        </p>
        <div className="stack">
          <button type="button" className="btn btn-primary btn-block" onClick={() => void doExport('filtered')}>
            Exportar registros filtrados ({records.length})
          </button>
          <button type="button" className="btn btn-quiet btn-block" onClick={() => void doExport('all')}>
            Exportar todos los registros ({tasks.length})
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setExporting(false)}>
            Cancelar
          </button>
        </div>
      </Modal>
    </div>
  );
}

function HelpTip({ text }: { text: string }) {
  return (
    <span className="help-tip" tabIndex={0} role="note" aria-label={`Cómo se calcula: ${text}`} title={text}>
      <Info size={14} aria-hidden="true" />
    </span>
  );
}

function Kpi({ widget: w, metrics: m }: { widget: Widget; metrics: Metrics }) {
  let value: ReactNode = '';
  let foot: ReactNode = null;
  const insufficient = <span className="kpi-na">Sin datos suficientes</span>;
  switch (w.id) {
    case 'created':
      value = m.created;
      break;
    case 'completed':
      value = m.completed;
      foot = m.cancelled ? `${m.cancelled} cancelada(s), no se cuentan` : null;
      break;
    case 'pending':
      value = m.pending;
      foot = 'al día de hoy';
      break;
    case 'overdue':
      value = m.overdue;
      foot = 'al día de hoy';
      break;
    case 'onTime':
      value = m.onTimePct === null ? insufficient : `${m.onTimePct}%`;
      foot = m.onTimeBase ? `base: ${m.onTimeBase} con vencimiento` : null;
      break;
    case 'avgTime':
      value = m.avgDays === null ? insufficient : `${m.avgDays} d`;
      foot = m.avgDaysBase ? `días calendario · base: ${m.avgDaysBase}${m.avgDaysFromStart !== null ? ` · desde inicio: ${m.avgDaysFromStart} d` : ''}` : null;
      break;
    case 'subtasksDone':
      value = m.subtasksDone;
      foot = 'acciones operativas';
      break;
    case 'avgSubtasks':
      value = m.avgSubtasks === null ? insufficient : m.avgSubtasks;
      foot = `en ${m.recordCount} registro(s)`;
      break;
  }
  return (
    <section className={`kpi kpi-${w.id}`} aria-label={w.title}>
      <span className="kpi-title">
        {w.title} <HelpTip text={w.help} />
      </span>
      <span className="kpi-value">{value}</span>
      {foot && <span className="kpi-foot">{foot}</span>}
    </section>
  );
}

function ChartCard({ widget: w, metrics: m }: { widget: Widget; metrics: Metrics }) {
  const body =
    w.id === 'byPeriod' ? (
      <TrendChart series={m.series} />
    ) : (
      <BarList data={w.id === 'byCategory' ? m.byCategory : w.id === 'byProject' ? m.byProject : m.byResult} label={w.title} />
    );
  return (
    <section className={`card chart-card${w.id === 'byPeriod' ? ' chart-wide' : ''}`} aria-label={w.title}>
      <div className="card-head">
        <h2 className="card-title">
          {w.title} <HelpTip text={w.help} />
        </h2>
      </div>
      {body}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tabla de registros                                                   */
/* ------------------------------------------------------------------ */

function RecordsTable({
  records,
  ctx,
  basis,
  onBasis,
  onOpen,
}: {
  records: ReturnType<typeof recordSet>;
  ctx: RecordContext;
  basis: DateBasis;
  onBasis: (b: DateBasis) => void;
  onOpen: (id: string) => void;
}) {
  const { settings } = useData();
  const cols = useMemo(() => allColumns(ctx.customFields), [ctx.customFields]);
  const chosen = settings.analytics.columns.length ? settings.analytics.columns : cols.filter((c) => c.default).map((c) => c.id);
  const visibleCols = cols.filter((c) => chosen.includes(c.id) || c.id === 'title');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ id: string; dir: 1 | -1 }>({ id: 'createdAt', dir: -1 });
  const [limit, setLimit] = useState(50);
  const [picking, setPicking] = useState(false);

  const rows = useMemo(() => {
    const q = normalizeText(query.trim());
    const col = cols.find((c) => c.id === sort.id) ?? cols[0];
    let list = records;
    if (q) {
      list = list.filter((t) => normalizeText(visibleCols.map((c) => displayCell(c.get(t, ctx))).join(' ')).includes(q));
    }
    return [...list].sort((a, b) => {
      const x = sortKey(col.get(a, ctx));
      const y = sortKey(col.get(b, ctx));
      if (x === y) return 0;
      if (x === '') return 1;
      if (y === '') return -1;
      return (x < y ? -1 : 1) * sort.dir;
    });
  }, [records, query, sort, cols, visibleCols, ctx]);

  const setColumns = (ids: string[]) => void repo.saveSettings({ analytics: { ...settings.analytics, columns: ids } });

  return (
    <section className="card records" aria-labelledby="rec-title">
      <div className="card-head records-head">
        <h2 id="rec-title" className="card-title">
          Registros <span className="count">{rows.length}</span>
        </h2>
        <div className="records-tools">
          <label className="field-inline">
            <span>Fecha de referencia</span>
            <select value={basis} onChange={(e) => onBasis(e.target.value as DateBasis)}>
              {(Object.keys(BASIS_LABEL) as DateBasis[]).map((b) => (
                <option key={b} value={b}>
                  {BASIS_LABEL[b]}
                </option>
              ))}
            </select>
          </label>
          <div className="search-box search-box-sm">
            <Search size={16} aria-hidden="true" />
            <input type="search" aria-label="Buscar en los registros" placeholder="Buscar" value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && (
              <button type="button" className="icon-btn icon-btn-sm" aria-label="Borrar búsqueda" onClick={() => setQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPicking(true)}>
            <Columns3 size={15} aria-hidden="true" /> Columnas
          </button>
        </div>
      </div>
      <p className="small muted">Una fila por actividad principal. El periodo se aplica según la fecha de referencia elegida. Toca una fila para abrir su detalle.</p>
      {rows.length === 0 ? (
        <p className="muted small pad">No hay registros con estos filtros.</p>
      ) : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabla de registros (desplazable)">
          <table className="rtable">
            <thead>
              <tr>
                {visibleCols.map((c) => (
                  <th key={c.id} scope="col" aria-sort={sort.id === c.id ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={c.numeric ? 'num' : ''}>
                    <button type="button" className="th-btn" onClick={() => setSort((s) => ({ id: c.id, dir: s.id === c.id ? (s.dir === 1 ? -1 : 1) : 1 }))}>
                      {c.label}
                      {sort.id === c.id && (sort.dir === 1 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((t) => (
                <tr key={t.id} onClick={() => onOpen(t.id)}>
                  {visibleCols.map((c) => (
                    <td key={c.id} className={c.numeric ? 'num' : ''}>
                      {c.id === 'title' ? (
                        <button type="button" className="row-open" onClick={(e) => (e.stopPropagation(), onOpen(t.id))}>
                          {t.title}
                        </button>
                      ) : (
                        displayCell(c.get(t, ctx))
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit && (
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setLimit((l) => l + 100)}>
          Mostrar más ({rows.length - limit} restantes)
        </button>
      )}
      <Modal open={picking} onClose={() => setPicking(false)} title="Columnas" size="sm">
        <ul className="col-pick">
          {cols.map((c) => (
            <li key={c.id}>
              <label className="check-line check-line-olive">
                <input
                  type="checkbox"
                  disabled={c.id === 'title'}
                  checked={c.id === 'title' || chosen.includes(c.id)}
                  onChange={(e) => setColumns(e.target.checked ? [...chosen, c.id] : chosen.filter((x) => x !== c.id))}
                />
                {c.label}
              </label>
            </li>
          ))}
        </ul>
        <div className="row-end">
          <button type="button" className="btn btn-link" onClick={() => setColumns([])}>
            Restablecer
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setPicking(false)}>
            Listo
          </button>
        </div>
      </Modal>
    </section>
  );
}
