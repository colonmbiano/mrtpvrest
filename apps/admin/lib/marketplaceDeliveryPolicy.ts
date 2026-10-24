export const DELIVERY_POLICIES = [
  { value: "OWN_ONLY", label: "Solo repartidores del negocio" },
  { value: "SHARED_ONLY", label: "Solo red compartida" },
  { value: "OWN_THEN_SHARED", label: "Propios y fallback a red" },
  { value: "MANUAL", label: "Manual (esperar operador)" },
] as const;

type DeliveryPolicy = typeof DELIVERY_POLICIES[number]["value"];
interface PolicyConfig { deliveryPolicy: DeliveryPolicy; fallbackSeconds: number; maxDistanceKm: number }
export interface PolicyDraft { deliveryPolicy: string; fallbackSeconds: string; maxDistanceKm: string }
export interface PolicyEditorState {
  draft: PolicyDraft; merchantId: string | null; loading: boolean; saving: boolean;
  loadError: string; error: string; message: string;
}
export interface PolicyApi {
  get: (url: string) => Promise<{ data: unknown }>;
  put: (url: string, body: PolicyConfig) => Promise<{ data: unknown }>;
}
export function initialPolicyState(): PolicyEditorState {
  return { draft: { deliveryPolicy: "OWN_THEN_SHARED", fallbackSeconds: "30", maxDistanceKm: "10" },
    merchantId: null, loading: true, saving: false, loadError: "", error: "", message: "" };
}
export function policyPayload(draft: PolicyDraft): PolicyConfig {
  if (!DELIVERY_POLICIES.some(policy => policy.value === draft.deliveryPolicy)) throw new Error("Selecciona una política válida.");
  if (!/^\d+$/.test(draft.fallbackSeconds) || !Number.isSafeInteger(Number(draft.fallbackSeconds))
    || Number(draft.fallbackSeconds) > 3600) throw new Error("El tiempo debe ser un número entero entre 0 y 3600 segundos.");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(draft.maxDistanceKm) || !Number.isFinite(Number(draft.maxDistanceKm))
    || Number(draft.maxDistanceKm) <= 0 || Number(draft.maxDistanceKm) > 100) throw new Error("El radio debe ser mayor que 0 y hasta 100 km.");
  return { deliveryPolicy: draft.deliveryPolicy as DeliveryPolicy,
    fallbackSeconds: Number(draft.fallbackSeconds), maxDistanceKm: Number(draft.maxDistanceKm) };
}
function readConfig(data: unknown): { merchantId: string; draft: PolicyDraft } {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("INVALID_POLICY_RESPONSE");
  const record = data as Record<string, unknown>;
  if (typeof record.merchantId !== "string" || !record.merchantId || record.merchantId.trim() !== record.merchantId
    || record.merchantId.length > 128 || /[\x00-\x1f\x7f]/.test(record.merchantId)
    || typeof record.deliveryPolicy !== "string" || typeof record.fallbackSeconds !== "number"
    || typeof record.maxDistanceKm !== "number") throw new Error("INVALID_POLICY_RESPONSE");
  const draft = { deliveryPolicy: record.deliveryPolicy, fallbackSeconds: String(record.fallbackSeconds), maxDistanceKm: String(record.maxDistanceKm) };
  policyPayload(draft);
  return { merchantId: record.merchantId, draft };
}
function requestError(error: unknown, fallback: string): string {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  if (status === 401 || status === 403) return "No tienes permiso para configurar el despacho. Revisa tu sesión.";
  if (status === 404) return "La sucursal seleccionada no tiene un comercio de Marketplace registrado.";
  if (status === 409) return "Selecciona una sucursal para configurar su despacho.";
  if (status === 422) return "La configuración no es válida. Revisa los campos y la sucursal seleccionada.";
  return fallback;
}

// UI state and API ports stay testable without mounting the app or making network calls.
export function createPolicyEditor({ api, getScope, onChange }: {
  api: PolicyApi; getScope: () => string; onChange: (state: PolicyEditorState) => void;
}) {
  let state = initialPolicyState(); let generation = 0; let disposed = false; let loadedScope: string | null = null;
  function publish(patch: Partial<PolicyEditorState>) { state = { ...state, ...patch }; if (!disposed) onChange(state); }
  function current(ticket: number, scope: string): boolean {
    if (disposed || ticket !== generation) return false;
    return getScope() === scope;
  }
  async function load(): Promise<void> {
    if (disposed) return;
    const ticket = ++generation; const scope = getScope(); loadedScope = null;
    publish(initialPolicyState());
    try {
      const { data } = await api.get("/api/marketplace/v1/merchants/me/delivery-policy");
      if (disposed || ticket !== generation) return;
      if (getScope() !== scope) { await load(); return; }
      const config = readConfig(data); loadedScope = scope;
      publish({ ...config, loading: false });
    } catch (error) {
      if (disposed || ticket !== generation) return;
      if (getScope() !== scope) { await load(); return; }
      publish({ loading: false,
        loadError: requestError(error, "No se pudo cargar la política de despacho. Intenta de nuevo.") });
    }
  }
  async function save(): Promise<boolean> {
    if (disposed || state.loading || state.saving || !state.merchantId) return false;
    if (getScope() !== loadedScope) { await load(); return false; }
    let payload: PolicyConfig;
    try { payload = policyPayload(state.draft); }
    catch (error) { publish({ error: (error as Error).message, message: "" }); return false; }
    const ticket = generation; const scope = getScope(); const merchantId = state.merchantId;
    publish({ saving: true, error: "", message: "" });
    try {
      const { data } = await api.put(`/api/marketplace/v1/merchants/${encodeURIComponent(merchantId)}/delivery-policy`, payload);
      if (!current(ticket, scope)) return false;
      const config = readConfig(data);
      if (config.merchantId !== merchantId) throw new Error("INVALID_POLICY_RESPONSE");
      publish({ draft: config.draft, saving: false, message: "Política de despacho guardada." }); return true;
    } catch (error) {
      if (current(ticket, scope)) publish({ saving: false, error: requestError(error, "No se pudo guardar la política. Intenta de nuevo.") });
      return false;
    }
  }
  return { load, save, getState: () => state,
    setField(field: keyof PolicyDraft, value: string) {
      if (!disposed && !state.loading && !state.saving && state.merchantId) publish({ draft: { ...state.draft, [field]: value }, error: "", message: "" });
    },
    dispose() { disposed = true; generation++; },
  };
}
