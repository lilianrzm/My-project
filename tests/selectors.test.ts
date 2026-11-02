import { describe, expect, it } from 'vitest';
import { buildTask } from '../src/db/repo';
import { groupUpcoming, isForToday, isInbox, searchTasks, sortTasks } from '../src/domain/selectors';

const today = '2026-11-02'; // lunes
const t = (o: Parameters<typeof buildTask>[0]) => buildTask(o);

describe('selectores', () => {
  it('Hoy incluye vencidas, de hoy y marcadas', () => {
    expect(isForToday(t({ title: 'a', dueDate: '2026-11-01' }), today)).toBe(true);
    expect(isForToday(t({ title: 'b', dueDate: today }), today)).toBe(true);
    expect(isForToday(t({ title: 'c', todayDate: today }), today)).toBe(true);
    expect(isForToday(t({ title: 'd', dueDate: '2026-11-03' }), today)).toBe(false);
  });
  it('Inbox: sin proyecto, sin fecha y sin marcar', () => {
    expect(isInbox(t({ title: 'a' }))).toBe(true);
    expect(isInbox(t({ title: 'b', projectId: 'p' }))).toBe(false);
    expect(isInbox(t({ title: 'c', dueDate: today }))).toBe(false);
  });
  it('agrupa Próximamente', () => {
    const g = groupUpcoming(
      [
        t({ title: 'mañana', dueDate: '2026-11-03' }),
        t({ title: 'semana', dueDate: '2026-11-07' }),
        t({ title: 'próxima', dueDate: '2026-11-12' }),
        t({ title: 'luego', dueDate: '2026-12-20' }),
      ],
      today,
      1,
    );
    expect(g.map((x) => x.tasks.map((y) => y.title))).toEqual([['mañana'], ['semana'], ['próxima'], ['luego']]);
  });
  it('búsqueda ignora acentos y mayúsculas', () => {
    const list = [t({ title: 'Comprar LÁMPARA' }), t({ title: 'Otra', notes: 'jardín' })];
    expect(searchTasks(list, 'lampara')).toHaveLength(1);
    expect(searchTasks(list, 'JARDIN')).toHaveLength(1);
  });
  it('ordena por prioridad', () => {
    const s = sortTasks([t({ title: 'baja', priority: 1 }), t({ title: 'alta', priority: 3 })], 'priority');
    expect(s[0].title).toBe('alta');
  });
});
