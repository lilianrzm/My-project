import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ExternalLink, FileImage, FileSpreadsheet, FileText, Paperclip, RefreshCw, Share, Trash2 } from 'lucide-react';
import { db } from '../db/db';
import * as repo from '../db/repo';
import { deliverFile } from '../db/backup';
import type { Attachment } from '../domain/types';
import { formatTimestamp } from '../domain/dates';
import { describeExtract, extractText, EXTRACT_MESSAGE, kindOf } from '../docs/extract';
import { useFeedback } from '../state/ui';
import { errorMessage } from '../hooks/useTaskActions';

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const TYPE_LABEL = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel', text: 'Texto', image: 'Imagen', other: 'Archivo' } as const;

/** Lee el documento localmente y propone una descripción por extracto. */
export async function describeAttachment(att: Attachment, force = false): Promise<void> {
  const blob = await repo.getAttachmentBlob(att.id);
  if (!blob) return;
  await repo.updateAttachment(att.id, { extractStatus: 'pending' });
  const r = await extractText(blob, att.name);
  const current = await db.attachments.get(att.id);
  if (!current) return;
  const desc = r.status === 'ok' ? describeExtract(r.text, att.name) : '';
  const status = r.status === 'ok' && !desc ? 'no-text' : r.status;
  // Nunca se reemplaza una descripción escrita a mano, salvo que se pida regenerar
  const keepManual = current.descriptionSource === 'manual' && !force;
  await repo.updateAttachment(att.id, {
    extractStatus: status,
    ...(keepManual || !desc ? {} : { description: desc, descriptionSource: 'auto' as const }),
  });
}

export function Attachments({ taskId, title }: { taskId: string; title: string }) {
  const list = useLiveQuery(() => db.attachments.where('taskId').equals(taskId).sortBy('addedAt'), [taskId]) ?? [];
  const { toast, confirm } = useFeedback();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      try {
        const att = await repo.addAttachment(taskId, f);
        void describeAttachment(att);
      } catch (e) {
        toast({ message: errorMessage(e), tone: 'error' });
      }
    }
    setBusy(false);
    if (input.current) input.current.value = '';
  };

  const remove = async (a: Attachment) => {
    const ok = await confirm({ title: 'Eliminar documento', message: `Se eliminará “${a.name}” de esta actividad.`, confirmLabel: 'Eliminar', tone: 'danger' });
    if (!ok) return;
    try {
      const d = await repo.deleteAttachment(a.id);
      if (d) toast({ message: 'Documento eliminado', action: { label: 'Deshacer', run: () => repo.restoreAttachment(d) }, duration: 7000 });
    } catch (e) {
      toast({ message: errorMessage(e), tone: 'error' });
    }
  };

  return (
    <div className="attachments">
      {list.length === 0 && <p className="muted small">Sin documentos. Adjunta PDF, Word, Excel, TXT o imágenes (máx. 25 MB cada uno).</p>}
      <ul className="att-list">
        {list.map((a) => (
          <AttachmentItem key={a.id} att={a} onRemove={() => void remove(a)} />
        ))}
      </ul>
      <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={() => input.current?.click()}>
        <Paperclip size={15} aria-hidden="true" /> {busy ? 'Guardando…' : 'Adjuntar documento'}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={repo.ACCEPT_ATTR}
        className="sr-only"
        tabIndex={-1}
        aria-label={`Adjuntar documentos a ${title}`}
        onChange={(e) => void onFiles(e.target.files)}
      />
    </div>
  );
}

function AttachmentItem({ att, onRemove }: { att: Attachment; onRemove: () => void }) {
  const { toast } = useFeedback();
  const kind = kindOf(att.name, att.mime);
  const [desc, setDesc] = useState(att.description);
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => setDesc(att.description), [att.description]);

  useEffect(() => {
    if (kind !== 'image') return;
    let url: string | null = null;
    void repo.getAttachmentBlob(att.id).then((b) => {
      if (b) {
        url = URL.createObjectURL(b);
        setThumb(url);
      }
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [att.id, kind]);

  const open = async () => {
    const blob = await repo.getAttachmentBlob(att.id);
    if (!blob) {
      toast({ message: 'No se encontró el contenido de este documento en el dispositivo.', tone: 'error' });
      return;
    }
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank', 'noopener');
    if (!w) {
      // Algunos modos (p. ej. app instalada) bloquean ventanas nuevas: usar la hoja de compartir/descarga
      await deliverFile(blob, att.name);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const share = async () => {
    const blob = await repo.getAttachmentBlob(att.id);
    if (blob) await deliverFile(blob, att.name);
  };

  const Icon = kind === 'image' ? FileImage : kind === 'xlsx' ? FileSpreadsheet : FileText;
  const msg = EXTRACT_MESSAGE[att.extractStatus];
  const canExtract = kind === 'pdf' || kind === 'docx' || kind === 'xlsx' || kind === 'text';

  return (
    <li className="att">
      <div className="att-head">
        {thumb ? <img className="att-thumb" src={thumb} alt="" /> : <Icon size={22} aria-hidden="true" className="att-icon" />}
        <div className="att-info">
          <span className="att-name">{att.name}</span>
          <span className="small muted">
            {TYPE_LABEL[kind]} · {formatBytes(att.size)} · {formatTimestamp(att.addedAt)}
          </span>
        </div>
        <div className="att-actions">
          <button type="button" className="icon-btn icon-btn-sm" aria-label={`Abrir ${att.name}`} title="Abrir" onClick={() => void open()}>
            <ExternalLink size={16} />
          </button>
          <button type="button" className="icon-btn icon-btn-sm" aria-label={`Compartir o guardar ${att.name}`} title="Compartir o guardar en Archivos" onClick={() => void share()}>
            <Share size={16} />
          </button>
          <button type="button" className="icon-btn icon-btn-sm" aria-label={`Eliminar ${att.name}`} title="Eliminar" onClick={onRemove}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <label className="sr-only" htmlFor={`att-${att.id}`}>
        Descripción de {att.name}
      </label>
      <textarea
        id={`att-${att.id}`}
        className="att-desc"
        rows={2}
        maxLength={2000}
        placeholder={att.extractStatus === 'pending' ? 'Leyendo el documento…' : 'Descripción breve'}
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onBlur={() => {
          if (desc !== att.description) void repo.updateAttachment(att.id, { description: desc.trim(), descriptionSource: desc.trim() ? 'manual' : 'none' });
        }}
      />
      <div className="att-foot">
        {att.descriptionSource === 'auto' && <span className="small muted">Extracto automático del documento · revísalo y edítalo si hace falta</span>}
        {att.descriptionSource === 'manual' && <span className="small muted">Descripción escrita a mano</span>}
        {att.descriptionSource === 'none' && msg && <span className="small muted">{msg}</span>}
        {canExtract && (att.extractStatus !== 'pending' || Date.now() - Date.parse(att.addedAt) > 90_000) && (
          <button type="button" className="btn btn-link btn-sm" onClick={() => void describeAttachment(att, true)}>
            <RefreshCw size={13} aria-hidden="true" /> Regenerar
          </button>
        )}
      </div>
    </li>
  );
}
