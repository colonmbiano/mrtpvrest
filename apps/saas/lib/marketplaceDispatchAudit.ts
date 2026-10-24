export const DISPATCH_STATUSES = ['WAITING_READY', 'OFFERING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'REASSIGNING', 'FAILED', 'CANCELLED'] as const;
export type DispatchStatus = typeof DISPATCH_STATUSES[number];
export type DispatchFilter = DispatchStatus | 'ACTIVE' | 'ALL';
export interface DispatchAuditTask {
  taskId: string;
  dispatchMode: 'OWN' | 'SHARED' | null;
  taskStatus: DispatchStatus;
  attempts: number;
}
interface DispatchPage { items: DispatchAuditTask[]; nextCursor: string | null }
interface DispatchApi {
  get: (url: string, config: { params: Record<string, string | number>; signal?: AbortSignal }) => Promise<{ data: unknown }>;
}
const ACTIVE_STATUSES = new Set<DispatchStatus>(['WAITING_READY', 'OFFERING', 'ASSIGNED', 'PICKED_UP', 'REASSIGNING']);
const isStatus = (status: unknown): status is DispatchStatus => DISPATCH_STATUSES.some(value => value === status);
function assertFilter(filter: string): asserts filter is DispatchFilter {
  if (filter !== 'ALL' && filter !== 'ACTIVE' && !isStatus(filter)) throw new Error('INVALID_DISPATCH_FILTER');
}
export function classifyDispatchTask(task: DispatchAuditTask) {
  return { active: ACTIVE_STATUSES.has(task.taskStatus), needsAttention: task.taskStatus === 'REASSIGNING' || task.attempts >= 2 };
}
export function filterDispatchTasks(tasks: DispatchAuditTask[], filter: DispatchFilter): DispatchAuditTask[] {
  assertFilter(filter);
  return tasks.filter(task => filter === 'ALL' || (filter === 'ACTIVE' ? classifyDispatchTask(task).active : task.taskStatus === filter));
}
export function countDispatchTasks(tasks: DispatchAuditTask[]) {
  const byStatus = Object.fromEntries(DISPATCH_STATUSES.map(status => [status, 0])) as Record<DispatchStatus, number>;
  const counts = { total: tasks.length, active: 0, attention: 0, own: 0, shared: 0, unassigned: 0, byStatus };
  for (const task of tasks) {
    const classification = classifyDispatchTask(task);
    if (classification.active) counts.active++;
    if (classification.needsAttention) counts.attention++;
    if (task.dispatchMode === 'OWN') counts.own++;
    else if (task.dispatchMode === 'SHARED') counts.shared++;
    else counts.unassigned++;
    counts.byStatus[task.taskStatus]++;
  }
  return counts;
}
export function mergeDispatchTasks(previous: DispatchAuditTask[], incoming: DispatchAuditTask[]): DispatchAuditTask[] {
  // A task can change while the operator pages. Count its latest observation once.
  return [...new Map([...previous, ...incoming].map(task => [task.taskId, task])).values()];
}
export function parseDispatchPage(data: unknown): DispatchPage {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('INVALID_DISPATCH_RESPONSE');
  const page = data as Record<string, unknown>;
  if (!Array.isArray(page.items) || page.items.length > 100 || (page.nextCursor !== null
    && (typeof page.nextCursor !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(page.nextCursor)))) throw new Error('INVALID_DISPATCH_RESPONSE');
  const ids = new Set<string>();
  const items = page.items.map((row: unknown): DispatchAuditTask => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('INVALID_DISPATCH_RESPONSE');
    const task = row as Record<string, unknown>;
    if (typeof task.id !== 'string' || !task.id || task.id.length > 128 || task.id.trim() !== task.id
      || /[\x00-\x1f\x7f]/.test(task.id) || ids.has(task.id) || !isStatus(task.status)
      || !['OWN', 'SHARED', null].includes(task.dispatchMode as 'OWN' | 'SHARED' | null)
      || !Number.isSafeInteger(task.attempts) || (task.attempts as number) < 0) throw new Error('INVALID_DISPATCH_RESPONSE');
    ids.add(task.id);
    return { taskId: task.id, taskStatus: task.status, dispatchMode: task.dispatchMode as DispatchAuditTask['dispatchMode'], attempts: task.attempts as number };
  });
  return { items, nextCursor: page.nextCursor as string | null };
}
export async function loadDispatchPage(api: DispatchApi, { filter = 'ACTIVE', cursor, signal }: {
  filter?: DispatchFilter; cursor?: string; signal?: AbortSignal;
} = {}): Promise<DispatchPage> {
  assertFilter(filter);
  const params: Record<string, string | number> = { limit: 100 };
  // The backend accepts a single exact status, not the UI's ACTIVE/ALL groups.
  if (isStatus(filter)) params.status = filter;
  if (cursor !== undefined) {
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(cursor)) throw new Error('INVALID_DISPATCH_CURSOR');
    params.cursor = cursor;
  }
  const { data } = await api.get('/api/marketplace/v1/ops/dispatch', { params, signal });
  const page = parseDispatchPage(data);
  if (cursor !== undefined && cursor === page.nextCursor || isStatus(filter) && page.items.some(task => task.taskStatus !== filter)) {
    throw new Error('INVALID_DISPATCH_RESPONSE');
  }
  return page;
}
export function dispatchLoadError(error: unknown): string {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 401 || status === 403 ? 'No tienes autorización para consultar las operaciones de despacho.'
    : 'No se pudieron cargar las tareas de despacho. Intenta de nuevo.';
}
