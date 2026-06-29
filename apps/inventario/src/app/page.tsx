"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Barcode,
  Camera,
  Check,
  ClipboardCheck,
  Download,
  Edit3,
  FileText,
  History,
  KeyRound,
  ListFilter,
  LogOut,
  Minus,
  PackageCheck,
  PackagePlus,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  Upload,
  UserRound,
  Warehouse,
  X,
} from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "mrtpv-inventario-session";
const COUNT_DRAFT_KEY = "mrtpv-inventario-count-draft";
const OPERATORS_KEY = "mrtpv-inventario-employee-cache";
const DEFAULT_API = "https://api.mrtpvrest.com";

type Operator = {
  id: string;
  name: string;
  pin?: string;
  role: string;
  isActive?: boolean;
  permissions?: string[];
};

type User = {
  id: string;
  name?: string;
  email: string;
  role: string;
  restaurantId?: string | null;
  restaurantSlug?: string | null;
};

type Restaurant = { id: string; name: string; slug?: string };
type Location = { id: string; name: string; slug?: string; isActive?: boolean; isCentralWarehouse?: boolean };
type Supplier = { id: string; name: string };

type Ingredient = {
  id: string;
  name: string;
  unit: string;
  baseUnit?: string;
  stock: number;
  minStock: number;
  cost?: number;
  supplierId?: string | null;
  imageUrl?: string | null;
  barcode?: string | null;
  supplier?: Supplier | null;
  category?: { id?: string; name: string; color?: string } | null;
};

type Movement = {
  id: string;
  ingredientId?: string;
  type?: "IN" | "OUT" | "ADJUST";
  quantity?: number;
  reason?: string | null;
  createdAt: string;
  ingredient?: { id: string; name: string; unit?: string; stock?: number; minStock?: number } | null;
};

const defaultOperators: Operator[] = [];

type PurchaseOrder = {
  id: string;
  poNumber?: string;
  totalAmount: number;
  paymentMethod: string;
  receivedAt?: string;
  createdAt: string;
  supplier?: Supplier | null;
};

type Session = {
  apiBaseUrl: string;
  accessToken: string;
  refreshToken: string;
  user: User;
  restaurantId: string;
  locationId: string;
};

type FormState = {
  id?: string;
  name: string;
  unit: string;
  stock: string;
  minStock: string;
  cost: string;
  supplierId: string;
  imageUrl: string;
};

type AdjustmentState = {
  ingredient: Ingredient;
  mode: "IN" | "OUT" | "ADJUST";
  quantity: string;
};

type PurchaseState = {
  ingredientId: string;
  qty: string;
  unitPrice: string;
  supplierId: string;
  paymentMethod: "TRANSFER" | "CORPORATE_CARD" | "CASH_DRAWER";
  notes: string;
};

type TransferState = {
  ingredientId: string;
  toLocationId: string;
  qty: string;
  notes: string;
};

type TicketLineState = {
  id: string;
  rawText: string;
  name: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  lineTotal: number;
  confidence: number;
  ingredientId: string;
  needsReview: boolean;
  include: boolean;
};

type TicketDraftState = {
  supplierName?: string | null;
  supplierMatch?: { id: string; name: string; confidence: number } | null;
  ticketNumber?: string | null;
  purchaseDate?: string | null;
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
  items: TicketLineState[];
};

type TabKey = "inventario" | "alertas" | "conteo" | "compras" | "ticket" | "movimientos" | "reparto";
type FilterKey = "todos" | "bajo" | "sinFoto" | "conValor";

const emptyForm: FormState = {
  name: "",
  unit: "pz",
  stock: "0",
  minStock: "0",
  cost: "0",
  supplierId: "",
  imageUrl: "",
};

const emptyPurchase: PurchaseState = {
  ingredientId: "",
  qty: "1",
  unitPrice: "0",
  supplierId: "",
  paymentMethod: "TRANSFER",
  notes: "",
};

const emptyTransfer: TransferState = {
  ingredientId: "",
  toLocationId: "",
  qty: "1",
  notes: "",
};

function normalizeApiUrl(value: string) {
  return (value || DEFAULT_API).trim().replace(/\/+$/, "");
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(toNumber(value));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "No se pudo completar la accion";
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeDate(iso?: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function withOperatorNote(note: string, operator: Operator | null) {
  return operator ? `${note} | Operador: ${operator.name} (${operator.id})` : note;
}

function movementOperator(reason?: string | null) {
  const match = reason?.match(/\|\s*Operador:\s*(.+)$/);
  return match?.[1]?.trim() || "Sin operador";
}

function movementReason(reason?: string | null) {
  return (reason || "Movimiento").replace(/\s*\|\s*Operador:\s*.+$/, "");
}

async function hashPin(pin: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function InventoryApp() {
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Ingredient[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabKey>("inventario");
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [ticketFile, setTicketFile] = useState<File | null>(null);
  const [ticketPreview, setTicketPreview] = useState("");
  const [ticketDraft, setTicketDraft] = useState<TicketDraftState | null>(null);
  const [ticketSupplierId, setTicketSupplierId] = useState("");
  const [ticketPaymentMethod, setTicketPaymentMethod] = useState<PurchaseState["paymentMethod"]>("TRANSFER");
  const [adjustment, setAdjustment] = useState<AdjustmentState | null>(null);
  const [purchase, setPurchase] = useState<PurchaseState>(emptyPurchase);
  const [transfer, setTransfer] = useState<TransferState>(emptyTransfer);
  const [countDraft, setCountDraft] = useState<Record<string, string>>({});
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [operators, setOperators] = useState<Operator[]>(defaultOperators);
  const [activeOperator, setActiveOperator] = useState<Operator | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinAdminOpen, setPinAdminOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as Session;
      if (parsed?.accessToken && parsed?.apiBaseUrl) {
        setSession(parsed);
        setApiBaseUrl(parsed.apiBaseUrl);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COUNT_DRAFT_KEY);
      if (saved) setCountDraft(JSON.parse(saved));
    } catch {
      localStorage.removeItem(COUNT_DRAFT_KEY);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(OPERATORS_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      if (Array.isArray(parsed) && parsed.length) setOperators(parsed);
    } catch {
      localStorage.removeItem(OPERATORS_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(COUNT_DRAFT_KEY, JSON.stringify(countDraft));
  }, [countDraft]);

  useEffect(() => {
    localStorage.setItem(OPERATORS_KEY, JSON.stringify(operators));
  }, [operators]);

  useEffect(() => {
    return () => {
      if (photoPreview && photoFile) URL.revokeObjectURL(photoPreview);
      if (ticketPreview && ticketFile) URL.revokeObjectURL(ticketPreview);
      stopScanner();
    };
  }, [photoFile, photoPreview, ticketFile, ticketPreview]);

  const saveSession = useCallback((next: Session | null) => {
    setSession(next);
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const refreshToken = useCallback(async (current: Session) => {
    const response = await fetch(`${current.apiBaseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
    if (!response.ok) throw new Error("Sesion expirada, inicia sesion de nuevo");
    const data = await response.json();
    const next = { ...current, accessToken: data.accessToken, refreshToken: data.refreshToken };
    saveSession(next);
    return next;
  }, [saveSession]);

  const apiFetch = useCallback(async (
    path: string,
    init: RequestInit = {},
    current: Session | null = session,
  ) => {
    if (!current) throw new Error("No hay sesion activa");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${current.accessToken}`);
    headers.set("x-restaurant-id", current.restaurantId);
    if (current.locationId) headers.set("x-location-id", current.locationId);
    if (!(init.body instanceof FormData) && init.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    let response = await fetch(`${current.apiBaseUrl}${path}`, { ...init, headers });
    if (response.status === 401) {
      const fresh = await refreshToken(current);
      headers.set("Authorization", `Bearer ${fresh.accessToken}`);
      response = await fetch(`${fresh.apiBaseUrl}${path}`, { ...init, headers });
    }

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(data?.error || data?.message || `Error ${response.status}`);
    return data;
  }, [refreshToken, session]);

  const loadLocations = useCallback(async (restaurantId: string, baseSession = session) => {
    if (!baseSession || !restaurantId) return;
    const scoped = { ...baseSession, restaurantId };
    const data = await apiFetch("/api/admin/locations", {}, scoped);
    const active = (Array.isArray(data) ? data : []).filter((loc: Location) => loc.isActive !== false);
    setLocations(active);
    if (!active.find((loc: Location) => loc.id === scoped.locationId)) {
      saveSession({ ...scoped, locationId: active[0]?.id || "" });
    } else {
      saveSession(scoped);
    }
  }, [apiFetch, saveSession, session]);

  const loadInventory = useCallback(async (baseSession = session) => {
    if (!baseSession?.locationId) return;
    setLoading(true);
    try {
      const [ingredients, providerList, movementList, purchaseList, employeeList] = await Promise.all([
        apiFetch("/api/inventory/ingredients", {}, baseSession),
        apiFetch("/api/purchases/lookup/suppliers", {}, baseSession).catch(() =>
          apiFetch("/api/inventory/suppliers", {}, baseSession).catch(() => []),
        ),
        apiFetch("/api/inventory/movements?limit=80", {}, baseSession).catch(() => []),
        apiFetch(`/api/purchases?locationId=${encodeURIComponent(baseSession.locationId)}`, {}, baseSession).catch(() => []),
        apiFetch("/api/employees/sync", {}, baseSession).catch(() => []),
      ]);
      const ingredientRows = Array.isArray(ingredients) ? ingredients : [];
      const supplierRows = Array.isArray(providerList) ? providerList : [];
      const employeeRows = Array.isArray(employeeList) ? employeeList : [];
      setItems(ingredientRows);
      setSuppliers(supplierRows);
      setMovements(Array.isArray(movementList) ? movementList : []);
      setPurchases(Array.isArray(purchaseList) ? purchaseList : []);
      if (employeeRows.length) setOperators(employeeRows);
      setPurchase((prev) => ({
        ...prev,
        ingredientId: prev.ingredientId || ingredientRows[0]?.id || "",
        supplierId: prev.supplierId || supplierRows[0]?.id || "",
      }));
      setTransfer((prev) => ({
        ...prev,
        ingredientId: prev.ingredientId || ingredientRows[0]?.id || "",
        toLocationId: prev.toLocationId || locations.find((loc) => loc.id !== baseSession.locationId)?.id || "",
      }));
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, locations, session]);

  const bootstrapTenant = useCallback(async (baseSession: Session) => {
    const tenant = await apiFetch("/api/tenant/me", {}, baseSession);
    const tenantRestaurants = Array.isArray(tenant?.restaurants) ? tenant.restaurants : [];
    const fallbackRestaurant = baseSession.user.restaurantId
      ? [{ id: baseSession.user.restaurantId, name: baseSession.user.restaurantSlug || "Mi tienda" }]
      : [];
    const nextRestaurants = tenantRestaurants.length ? tenantRestaurants : fallbackRestaurant;
    setRestaurants(nextRestaurants);
    const restaurantId = baseSession.restaurantId || nextRestaurants[0]?.id || baseSession.user.restaurantId || "";
    const nextSession = { ...baseSession, restaurantId };
    saveSession(nextSession);
    await loadLocations(restaurantId, nextSession);
  }, [apiFetch, loadLocations, saveSession]);

  useEffect(() => {
    if (!session) return;
    bootstrapTenant(session)
      .then(() => loadInventory(session))
      .catch((error) => toast.error(getErrorMessage(error)));
  }, [session?.accessToken]);

  useEffect(() => {
    if (session?.locationId) loadInventory(session);
  }, [session?.locationId]);

  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === session?.restaurantId);
  const selectedLocation = locations.find((location) => location.id === session?.locationId);
  const lowItems = useMemo(() => items.filter((item) => item.minStock > 0 && item.stock <= item.minStock), [items]);

  const stats = useMemo(() => {
    const total = items.length;
    const low = lowItems.length;
    const value = items.reduce((sum, item) => sum + toNumber(item.stock) * toNumber(item.cost), 0);
    const photos = items.filter((item) => item.imageUrl).length;
    const overstock = items.filter((item) => item.minStock > 0 && item.stock > item.minStock * 2).length;
    return { total, low, value, photos, overstock };
  }, [items, lowItems]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !q || [item.name, item.unit, item.supplier?.name, item.category?.name, item.barcode]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
      const matchesFilter =
        filter === "todos" ||
        (filter === "bajo" && item.minStock > 0 && item.stock <= item.minStock) ||
        (filter === "sinFoto" && !item.imageUrl) ||
        (filter === "conValor" && toNumber(item.stock) * toNumber(item.cost) > 0);
      return matchesQuery && matchesFilter;
    });
  }, [filter, items, query]);

  const currentPurchaseItem = items.find((item) => item.id === purchase.ingredientId);
  const currentTransferItem = items.find((item) => item.id === transfer.ingredientId);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      const base = normalizeApiUrl(apiBaseUrl);
      const response = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "No se pudo iniciar sesion");
      saveSession({
        apiBaseUrl: base,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
        restaurantId: data.user?.restaurantId || "",
        locationId: "",
      });
      toast.success("Sesion iniciada");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    saveSession(null);
    setActiveOperator(null);
    setItems([]);
    setLocations([]);
    setRestaurants([]);
    setSuppliers([]);
    setMovements([]);
    setPurchases([]);
    setPassword("");
  }

  async function handlePinLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pin = pinInput.trim();
    if (!pin) return;
    setSaving(true);
    try {
      const data = await apiFetch("/api/employees/login", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      const employee = data?.employee || data?.user;
      if (!employee?.id) throw new Error("Respuesta incompleta de empleados");
      const operator: Operator = {
        id: employee.id,
        name: employee.name,
        role: employee.role,
        isActive: employee.isActive !== false,
        permissions: employee.permissions || [],
      };
      setActiveOperator(operator);
      setPinInput("");
      toast.success(`Hola, ${operator.name}`);
    } catch (error) {
      if (navigator.onLine) {
        toast.error(getErrorMessage(error));
        setPinInput("");
        setSaving(false);
        return;
      }
      const pinHash = await hashPin(pin);
      const cached = operators.find((row) => row.pin === pinHash && row.isActive !== false);
      if (!cached) {
        toast.error("PIN incorrecto o empleado no sincronizado");
        setPinInput("");
        setSaving(false);
        return;
      }
      setActiveOperator(cached);
      setPinInput("");
      toast.success(`Hola, ${cached.name}`);
    } finally {
      setSaving(false);
    }
  }

  async function resyncOperators() {
    setSaving(true);
    try {
      const data = await apiFetch("/api/employees/sync");
      const rows = Array.isArray(data) ? data : [];
      setOperators(rows);
      toast.success(`${rows.length} empleados sincronizados`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function removeCachedOperator(operatorId: string) {
    setOperators((prev) => prev.filter((operator) => operator.id !== operatorId));
  }

  function clearEmployeeCache() {
    if (!window.confirm("Borrar empleados sincronizados de esta tablet?")) return;
    setOperators([]);
    setActiveOperator(null);
    localStorage.removeItem(OPERATORS_KEY);
    toast.success("Cache de empleados borrado");
  }

  function openNewForm(seedName = "") {
    setForm({ ...emptyForm, name: seedName });
    setPhotoFile(null);
    setPhotoPreview("");
    setFormOpen(true);
  }

  function openEditForm(item: Ingredient) {
    setForm({
      id: item.id,
      name: item.name,
      unit: item.unit || "pz",
      stock: String(item.stock ?? 0),
      minStock: String(item.minStock ?? 0),
      cost: String(item.cost ?? 0),
      supplierId: item.supplierId || "",
      imageUrl: item.imageUrl || "",
    });
    setPhotoFile(null);
    setPhotoPreview(item.imageUrl || "");
    setFormOpen(true);
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (photoPreview && photoFile) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function handleTicketPhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (ticketPreview && ticketFile) URL.revokeObjectURL(ticketPreview);
    setTicketFile(file);
    setTicketPreview(URL.createObjectURL(file));
    setTicketDraft(null);
  }

  async function uploadPhotoIfNeeded() {
    if (!photoFile) return form.imageUrl;
    const body = new FormData();
    body.append("image", photoFile);
    const data = await apiFetch("/api/upload/image", { method: "POST", body });
    return data?.url || form.imageUrl;
  }

  async function uploadTicketPhotoIfNeeded() {
    if (!ticketFile) return "";
    const body = new FormData();
    body.append("image", ticketFile);
    const data = await apiFetch("/api/upload/image", { method: "POST", body });
    return data?.url || "";
  }

  async function handleSaveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error("Escribe el nombre del producto");
      return;
    }
    setSaving(true);
    try {
      const imageUrl = await uploadPhotoIfNeeded();
      const payload = {
        name: form.name.trim(),
        unit: form.unit.trim() || "pz",
        stock: toNumber(form.stock),
        minStock: toNumber(form.minStock),
        cost: toNumber(form.cost),
        supplierId: form.supplierId || null,
        imageUrl: imageUrl || null,
        baseUnit: "PIECE",
      };
      if (form.id) {
        await apiFetch(`/api/inventory/ingredients/${form.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/api/inventory/ingredients", { method: "POST", body: JSON.stringify(payload) });
      }
      toast.success(form.id ? "Producto actualizado" : "Producto agregado");
      setFormOpen(false);
      await loadInventory();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: Ingredient) {
    const confirmed = window.confirm(`Eliminar ${item.name}?`);
    if (!confirmed) return;
    try {
      await apiFetch(`/api/inventory/ingredients/${item.id}`, { method: "DELETE" });
      toast.success("Producto eliminado");
      await loadInventory();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function handleAdjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adjustment) return;
    const qty = toNumber(adjustment.quantity);
    if (qty < 0 || (adjustment.mode !== "ADJUST" && qty <= 0)) {
      toast.error("Cantidad invalida");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/inventory/movements", {
        method: "POST",
        body: JSON.stringify({
          ingredientId: adjustment.ingredient.id,
          type: adjustment.mode,
          quantity: qty,
          reason: withOperatorNote(
            adjustment.mode === "ADJUST" ? "Conteo desde app inventario" : "Movimiento desde app inventario",
            activeOperator,
          ),
        }),
      });
      toast.success("Stock actualizado");
      setAdjustment(null);
      await loadInventory();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handlePurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const qty = toNumber(purchase.qty);
    const unitPrice = toNumber(purchase.unitPrice);
    if (!purchase.ingredientId || qty <= 0) {
      toast.error("Selecciona producto y cantidad");
      return;
    }
    setSaving(true);
    try {
      if (purchase.supplierId) {
        await apiFetch("/api/purchases", {
          method: "POST",
          body: JSON.stringify({
            supplierId: purchase.supplierId,
            locationId: session?.locationId,
            paymentMethod: purchase.paymentMethod,
            notes: withOperatorNote(purchase.notes || "Compra desde app inventario", activeOperator),
            items: [{ ingredientId: purchase.ingredientId, qty, unitPrice }],
          }),
        });
      } else {
        await apiFetch("/api/inventory/movements", {
          method: "POST",
          body: JSON.stringify({
            ingredientId: purchase.ingredientId,
            type: "IN",
            quantity: qty,
            reason: withOperatorNote("Entrada rapida sin proveedor", activeOperator),
          }),
        });
      }
      toast.success("Compra/entrada registrada");
      setPurchase((prev) => ({ ...prev, qty: "1", notes: "" }));
      await loadInventory();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function scanTicketWithAi() {
    if (!ticketFile) {
      toast.error("Toma foto del ticket primero");
      return;
    }
    setSaving(true);
    try {
      const makeBody = () => {
        const body = new FormData();
        body.append("images", ticketFile);
        return body;
      };
      let response;
      try {
        response = await apiFetch("/api/ai/scan-purchase-ticket", { method: "POST", body: makeBody() });
      } catch (error) {
        const message = getErrorMessage(error);
        if (!message.includes("404")) throw error;
        const fallback = await apiFetch("/api/ai/scan-inventory", { method: "POST", body: makeBody() });
        const ingredients = Array.isArray(fallback?.data?.ingredients) ? fallback.data.ingredients : [];
        response = {
          data: {
            supplierName: null,
            supplierMatch: null,
            ticketNumber: null,
            purchaseDate: null,
            subtotal: 0,
            tax: 0,
            total: ingredients.reduce((sum: number, item: { totalCost?: number }) => sum + toNumber(item.totalCost), 0),
            notes: "Fallback scan-inventory",
            items: ingredients.map((item: { name?: string; totalCost?: number; quantityFound?: number }, index: number) => ({
              id: `fallback-line-${index + 1}`,
              rawText: item.name || "",
              name: item.name || "",
              quantity: toNumber(item.quantityFound) || 1,
              unit: "pz",
              unitPrice: (toNumber(item.totalCost) || 0) / (toNumber(item.quantityFound) || 1),
              lineTotal: toNumber(item.totalCost),
              confidence: 0.58,
              needsReview: true,
              ingredientMatch: null,
            })),
          },
        };
      }
      const data = response?.data || {};
      const lines = Array.isArray(data.items) ? data.items : [];
      setTicketSupplierId(data.supplierMatch?.id || suppliers[0]?.id || "");
      setTicketDraft({
        supplierName: data.supplierName || null,
        supplierMatch: data.supplierMatch || null,
        ticketNumber: data.ticketNumber || null,
        purchaseDate: data.purchaseDate || null,
        subtotal: toNumber(data.subtotal),
        tax: toNumber(data.tax),
        total: toNumber(data.total),
        notes: data.notes || "",
        items: lines.map((line: {
          id?: string;
          rawText?: string;
          name?: string;
          quantity?: number;
          unit?: string;
          unitPrice?: number;
          lineTotal?: number;
          confidence?: number;
          needsReview?: boolean;
          ingredientMatch?: { id?: string } | null;
        }, index: number) => ({
          id: line.id || `ticket-line-${index + 1}`,
          rawText: line.rawText || "",
          name: line.name || "",
          quantity: String(line.quantity || 1),
          unit: line.unit || "pz",
          unitPrice: String(toNumber(line.unitPrice)),
          lineTotal: toNumber(line.lineTotal),
          confidence: toNumber(line.confidence),
          ingredientId: line.ingredientMatch?.id || "",
          needsReview: Boolean(line.needsReview),
          include: true,
        })),
      });
      setTab("ticket");
      toast.success("Ticket leido. Revisa antes de aplicar.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function updateTicketLine(id: string, patch: Partial<TicketLineState>) {
    setTicketDraft((prev) => prev ? {
      ...prev,
      items: prev.items.map((line) => line.id === id ? { ...line, ...patch, needsReview: false } : line),
    } : prev);
  }

  async function applyTicketPurchase() {
    if (!ticketDraft) return;
    const selected = ticketDraft.items.filter((line) => line.include);
    if (!ticketSupplierId) {
      toast.error("Selecciona proveedor");
      return;
    }
    if (!selected.length) {
      toast.error("Selecciona al menos un renglon");
      return;
    }
    const missing = selected.find((line) => !line.ingredientId || toNumber(line.quantity) <= 0);
    if (missing) {
      toast.error("Revisa productos y cantidades antes de aplicar");
      return;
    }
    setSaving(true);
    try {
      const photoUrl = await uploadTicketPhotoIfNeeded();
      await apiFetch("/api/purchases", {
        method: "POST",
        body: JSON.stringify({
          supplierId: ticketSupplierId,
          locationId: session?.locationId,
          paymentMethod: ticketPaymentMethod,
          photoUrl: photoUrl || null,
          occurredAt: ticketDraft.purchaseDate || undefined,
          notes: withOperatorNote(
            `Ticket IA${ticketDraft.ticketNumber ? ` ${ticketDraft.ticketNumber}` : ""}${ticketDraft.supplierName ? ` - ${ticketDraft.supplierName}` : ""}`,
            activeOperator,
          ),
          items: selected.map((line) => ({
            ingredientId: line.ingredientId,
            qty: toNumber(line.quantity),
            unitPrice: toNumber(line.unitPrice),
          })),
        }),
      });
      toast.success("Compra aplicada al inventario");
      setTicketDraft(null);
      setTicketFile(null);
      setTicketPreview("");
      await loadInventory();
      setTab("movimientos");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const qty = toNumber(transfer.qty);
    if (!transfer.ingredientId || !transfer.toLocationId || qty <= 0) {
      toast.error("Selecciona producto, destino y cantidad");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/transfers", {
        method: "POST",
        body: JSON.stringify({
          notes: withOperatorNote(transfer.notes || "Reparto desde app inventario", activeOperator),
          items: [{ ingredientId: transfer.ingredientId, toLocationId: transfer.toLocationId, qty }],
        }),
      });
      toast.success("Reparto registrado");
      setTransfer((prev) => ({ ...prev, qty: "1", notes: "" }));
      await loadInventory();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function saveCountDraft() {
    const entries = Object.entries(countDraft)
      .map(([id, value]) => ({ item: items.find((row) => row.id === id), value }))
      .filter((row) => row.item && row.value.trim() !== "");
    if (!entries.length) {
      toast.error("No hay conteos capturados");
      return;
    }
    setSaving(true);
    try {
      for (const row of entries) {
        await apiFetch("/api/inventory/movements", {
          method: "POST",
          body: JSON.stringify({
            ingredientId: row.item!.id,
            type: "ADJUST",
            quantity: toNumber(row.value),
            reason: withOperatorNote("Conteo fisico desde app inventario", activeOperator),
          }),
        });
      }
      toast.success(`${entries.length} conteos aplicados`);
      setCountDraft({});
      await loadInventory();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function changeRestaurant(restaurantId: string) {
    if (!session) return;
    setActiveOperator(null);
    const next = { ...session, restaurantId, locationId: "" };
    saveSession(next);
    await loadLocations(restaurantId, next);
  }

  function changeLocation(locationId: string) {
    if (!session) return;
    setActiveOperator(null);
    saveSession({ ...session, locationId });
  }

  function exportInventory(scope: "all" | "low" | "movements") {
    if (scope === "movements") {
      downloadCsv("movimientos-inventario.csv", [
        ["Fecha", "Producto", "Tipo", "Cantidad", "Operador", "Razon"],
        ...movements.map((m) => [
          safeDate(m.createdAt),
          m.ingredient?.name || m.ingredientId || "",
          m.type || "",
          m.quantity || "",
          movementOperator(m.reason),
          movementReason(m.reason),
        ]),
      ]);
      return;
    }
    const source = scope === "low" ? lowItems : items;
    downloadCsv(scope === "low" ? "bajo-stock.csv" : "inventario.csv", [
      ["Producto", "Stock", "Unidad", "Minimo", "Costo", "Valor", "Proveedor", "Foto"],
      ...source.map((item) => [
        item.name,
        item.stock,
        item.unit,
        item.minStock,
        item.cost || 0,
        toNumber(item.stock) * toNumber(item.cost),
        item.supplier?.name || "",
        item.imageUrl || "",
      ]),
    ]);
  }

  function processCode(rawCode: string) {
    const code = rawCode.trim();
    if (!code) return;
    const found = items.find((item) =>
      item.barcode === code || item.name.toLowerCase().includes(code.toLowerCase()),
    );
    if (found) {
      setQuery(found.name);
      setTab("inventario");
      toast.success(`Encontrado: ${found.name}`);
    } else {
      openNewForm(code);
      toast.message("No encontre producto; puedes darlo de alta");
    }
    setManualCode("");
  }

  function handleManualCode() {
    processCode(manualCode);
  }

  async function startScanner() {
    setScannerOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      const Detector = (window as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
      if (!Detector) {
        toast.message("Camara abierta. Si tu Android no detecta codigo, usa entrada manual.");
        return;
      }
      const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"] });
      scanTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current) return;
        const codes = await detector.detect(videoRef.current).catch(() => []);
        const code = codes[0]?.rawValue;
        if (code) {
          stopScanner();
          setScannerOpen(false);
          processCode(code);
        }
      }, 750);
    } catch {
      toast.error("No pude abrir la camara");
      setScannerOpen(false);
    }
  }

  function stopScanner() {
    if (scanTimerRef.current) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function closeScanner() {
    stopScanner();
    setScannerOpen(false);
  }

  if (!session) {
    return (
      <main className="app">
        <section className="login-shell">
          <form className="login-card card" onSubmit={handleLogin}>
            <div className="brand-mark"><Warehouse size={30} /></div>
            <div>
              <p className="eyebrow">MRTPV Inventario</p>
              <h1>Inventario independiente</h1>
              <p className="muted">Stock, compras, conteos y alertas por sucursal.</p>
            </div>
            <label className="field">
              <span>API</span>
              <input className="input" value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} />
            </label>
            <label className="field">
              <span>Email</span>
              <input className="input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="field">
              <span>Contrasena</span>
              <input className="input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button className="btn" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
          </form>
        </section>
      </main>
    );
  }

  if (!activeOperator) {
    return (
      <main className="app">
        <section className="login-shell">
          <form className="login-card card" onSubmit={handlePinLogin}>
            <div className="brand-mark"><KeyRound size={30} /></div>
            <div>
              <p className="eyebrow">Operador</p>
              <h1>Entrar con PIN</h1>
              <p className="muted">{selectedLocation?.name || "Sucursal"} - {selectedRestaurant?.name || session.user.email}</p>
            </div>
            <label className="field">
              <span>PIN</span>
              <input
                className="input pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={pinInput}
                onChange={(event) => setPinInput(event.target.value.replace(/\D/g, "").slice(0, 8))}
                autoFocus
              />
            </label>
            <button className="btn" disabled={!pinInput.trim() || saving}><KeyRound size={18} /> {saving ? "Validando..." : "Entrar"}</button>
            <button className="btn secondary" type="button" onClick={() => setPinAdminOpen((open) => !open)}>
              <UserRound size={18} /> Empleados sincronizados
            </button>
            {pinAdminOpen && (
              <div className="pin-admin">
                <div className="employee-sync-actions">
                  <button className="btn secondary" type="button" onClick={resyncOperators} disabled={saving}>
                    <RefreshCw size={17} /> Sincronizar
                  </button>
                  <button className="btn danger" type="button" onClick={clearEmployeeCache}>
                    <Trash2 size={17} /> Borrar cache
                  </button>
                </div>
                <div className="operator-list">
                  {operators.map((operator) => (
                    <div className="operator-row" key={operator.id}>
                      <div><strong>{operator.name}</strong><span>{operator.role}</span></div>
                      <b>{operator.pin ? "Sync" : "Online"}</b>
                      <button type="button" onClick={() => removeCachedOperator(operator.id)} aria-label={`Quitar ${operator.name}`}><X size={15} /></button>
                    </div>
                  ))}
                  {operators.length === 0 && <div className="empty small">Sin empleados sincronizados. Con internet puedes entrar por PIN real o sincronizar.</div>}
                </div>
              </div>
            )}
            <button className="btn danger" type="button" onClick={handleLogout}><LogOut size={18} /> Salir de cuenta</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      <section className="shell inventory-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Inventario</p>
            <h1>{selectedLocation?.name || "Sucursal"}</h1>
            <p className="muted">{selectedRestaurant?.name || session.user.email}</p>
          </div>
          <div className="top-actions">
            <button className="operator-pill" type="button" onClick={() => setActiveOperator(null)} title="Cambiar operador">
              <UserRound size={17} />
              <span>{activeOperator.name}</span>
            </button>
            <button className="icon-btn" type="button" onClick={() => loadInventory()} aria-label="Actualizar" title="Actualizar">
              <RefreshCw size={20} />
            </button>
            <button className="icon-btn" type="button" onClick={handleLogout} aria-label="Salir" title="Salir">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <section className="context-grid">
          <label className="field">
            <span>Tienda</span>
            <div className="select-wrap">
              <Store size={18} />
              <select className="input" value={session.restaurantId} onChange={(event) => changeRestaurant(event.target.value)}>
                {restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}
              </select>
            </div>
          </label>
          <label className="field">
            <span>Sucursal</span>
            <div className="select-wrap">
              <Warehouse size={18} />
              <select className="input" value={session.locationId} onChange={(event) => changeLocation(event.target.value)}>
                {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </div>
          </label>
        </section>

        <section className="stat-grid">
          <article className="stat card"><span>Productos</span><strong>{stats.total}</strong></article>
          <article className={`stat card ${stats.low ? "alert" : ""}`}><span>Bajo stock</span><strong>{stats.low}</strong></article>
          <article className="stat card"><span>Valor</span><strong>{money(stats.value)}</strong></article>
          <article className="stat card"><span>Sobre stock</span><strong>{stats.overstock}</strong></article>
        </section>

        <section className="tabbar" aria-label="Vistas de inventario">
          {[
            ["inventario", ListFilter, "Inventario"],
            ["alertas", AlertTriangle, "Alertas"],
            ["conteo", ClipboardCheck, "Conteo"],
            ["compras", ShoppingCart, "Compras"],
            ["ticket", FileText, "Ticket IA"],
            ["movimientos", History, "Movs"],
            ["reparto", ArrowLeftRight, "Reparto"],
          ].map(([key, Icon, label]) => {
            const TabIcon = Icon as typeof ListFilter;
            return (
              <button key={key as string} className={tab === key ? "active" : ""} onClick={() => setTab(key as TabKey)} type="button">
                <TabIcon size={17} />
                <span>{label as string}</span>
              </button>
            );
          })}
        </section>

        {tab === "inventario" && (
          <>
            <section className="tool-row">
              <label className="search-box">
                <Search size={18} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto, proveedor o codigo" />
              </label>
              <button className="icon-btn" type="button" onClick={startScanner} aria-label="Escanear" title="Escanear">
                <Barcode size={20} />
              </button>
              <button className="btn add-btn" type="button" onClick={() => openNewForm()}>
                <PackagePlus size={20} /> Nuevo
              </button>
            </section>
            <section className="quick-scan card">
              <Barcode size={18} />
              <input value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Codigo o nombre rapido" />
              <button type="button" onClick={handleManualCode}>Buscar</button>
            </section>
            <section className="filter-row">
              {[
                ["todos", "Todos"],
                ["bajo", "Bajo stock"],
                ["sinFoto", "Sin foto"],
                ["conValor", "Con valor"],
              ].map(([key, label]) => (
                <button key={key} type="button" className={filter === key ? "active" : ""} onClick={() => setFilter(key as FilterKey)}>{label}</button>
              ))}
              <button type="button" onClick={() => exportInventory("all")}><Download size={14} /> CSV</button>
            </section>
            <InventoryList
              items={filteredItems}
              loading={loading}
              onAdjust={setAdjustment}
              onDelete={handleDelete}
              onEdit={openEditForm}
            />
          </>
        )}

        {tab === "alertas" && (
          <section className="panel-grid">
            <div className="section-title">
              <AlertTriangle size={18} />
              <div><strong>Alertas de bajo stock</strong><span>{lowItems.length} productos requieren atencion</span></div>
              <button type="button" onClick={() => exportInventory("low")}><Download size={15} /> CSV</button>
            </div>
            <InventoryList items={lowItems} loading={loading} onAdjust={setAdjustment} onDelete={handleDelete} onEdit={openEditForm} />
          </section>
        )}

        {tab === "conteo" && (
          <section className="panel-grid">
            <div className="section-title">
              <ClipboardCheck size={18} />
              <div><strong>Conteo fisico</strong><span>Captura stock real y aplica ajustes en lote</span></div>
              <button type="button" onClick={saveCountDraft} disabled={saving}><Check size={15} /> Aplicar</button>
            </div>
            <div className="count-list">
              {items.map((item) => (
                <article key={item.id} className="count-row card">
                  <div>
                    <strong>{item.name}</strong>
                    <span>Actual: {toNumber(item.stock).toLocaleString("es-MX")} {item.unit}</span>
                  </div>
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="Conteo"
                    value={countDraft[item.id] || ""}
                    onChange={(event) => setCountDraft((prev) => ({ ...prev, [item.id]: event.target.value }))}
                  />
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "compras" && (
          <section className="panel-grid two-col">
            <form className="card action-panel" onSubmit={handlePurchase}>
              <div className="section-title compact"><ShoppingCart size={18} /><div><strong>Compra rapida</strong><span>Entrada con proveedor o movimiento simple</span></div></div>
              <label className="field"><span>Producto</span><select className="input" value={purchase.ingredientId} onChange={(e) => setPurchase({ ...purchase, ingredientId: e.target.value })}>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <div className="form-grid">
                <label className="field"><span>Cantidad</span><input className="input" inputMode="decimal" value={purchase.qty} onChange={(e) => setPurchase({ ...purchase, qty: e.target.value })} /></label>
                <label className="field"><span>Costo unitario</span><input className="input" inputMode="decimal" value={purchase.unitPrice} onChange={(e) => setPurchase({ ...purchase, unitPrice: e.target.value })} /></label>
              </div>
              <label className="field"><span>Proveedor</span><select className="input" value={purchase.supplierId} onChange={(e) => setPurchase({ ...purchase, supplierId: e.target.value })}><option value="">Entrada sin proveedor</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <label className="field"><span>Pago</span><select className="input" value={purchase.paymentMethod} onChange={(e) => setPurchase({ ...purchase, paymentMethod: e.target.value as PurchaseState["paymentMethod"] })}><option value="TRANSFER">Transferencia</option><option value="CORPORATE_CARD">Tarjeta</option><option value="CASH_DRAWER">Caja</option></select></label>
              <label className="field"><span>Notas</span><input className="input" value={purchase.notes} onChange={(e) => setPurchase({ ...purchase, notes: e.target.value })} /></label>
              <div className="inline-summary"><PackageCheck size={16} /> {currentPurchaseItem?.name || "Producto"} - Total {money(toNumber(purchase.qty) * toNumber(purchase.unitPrice))}</div>
              <button className="btn" disabled={saving}><Save size={18} /> Registrar compra</button>
            </form>
            <div className="card action-panel">
              <div className="section-title compact"><FileText size={18} /><div><strong>Ultimas compras</strong><span>{purchases.length} registros recientes</span></div></div>
              <div className="mini-list">
                {purchases.slice(0, 12).map((po) => (
                  <div className="mini-row" key={po.id}><span>{po.poNumber || po.id.slice(-6)} - {po.supplier?.name || "Proveedor"}</span><strong>{money(po.totalAmount)}</strong><small>{safeDate(po.receivedAt || po.createdAt)}</small></div>
                ))}
                {purchases.length === 0 && <div className="empty small">Sin compras recientes</div>}
              </div>
            </div>
          </section>
        )}

        {tab === "ticket" && (
          <section className="panel-grid two-col">
            <div className="card action-panel">
              <div className="section-title compact">
                <FileText size={18} />
                <div><strong>Ticket con IA</strong><span>La IA captura, tu apruebas antes de mover stock</span></div>
              </div>
              <label className="photo-picker ticket-picker">
                {ticketPreview ? <img src={ticketPreview} alt="Ticket de compra" /> : <Camera size={34} />}
                <span><Upload size={16} /> Foto del ticket</span>
                <input type="file" accept="image/*" capture="environment" onChange={handleTicketPhotoChange} />
              </label>
              <button className="btn" type="button" onClick={scanTicketWithAi} disabled={!ticketFile || saving}>
                <FileText size={18} /> {saving ? "Leyendo..." : "Leer ticket"}
              </button>
              {ticketDraft && (
                <div className="ticket-summary">
                  <div><span>Proveedor detectado</span><strong>{ticketDraft.supplierName || "Sin detectar"}</strong></div>
                  <div><span>Fecha</span><strong>{ticketDraft.purchaseDate || "-"}</strong></div>
                  <div><span>Total ticket</span><strong>{money(ticketDraft.total)}</strong></div>
                  <div><span>Revision</span><strong>{ticketDraft.items.filter((line) => line.needsReview || !line.ingredientId).length}</strong></div>
                </div>
              )}
            </div>

            <div className="card action-panel">
              <div className="section-title compact">
                <Check size={18} />
                <div><strong>Revision y aplicacion</strong><span>Corrige producto, cantidad y costo</span></div>
              </div>
              {!ticketDraft && <div className="empty small">Toma foto del ticket para crear el borrador.</div>}
              {ticketDraft && (
                <>
                  <label className="field">
                    <span>Proveedor</span>
                    <select className="input" value={ticketSupplierId} onChange={(event) => setTicketSupplierId(event.target.value)}>
                      <option value="">Selecciona proveedor</option>
                      {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>Pago</span>
                    <select className="input" value={ticketPaymentMethod} onChange={(event) => setTicketPaymentMethod(event.target.value as PurchaseState["paymentMethod"])}>
                      <option value="TRANSFER">Transferencia</option>
                      <option value="CORPORATE_CARD">Tarjeta</option>
                      <option value="CASH_DRAWER">Caja</option>
                    </select>
                  </label>
                  <div className="ticket-line-list">
                    {ticketDraft.items.map((line) => (
                      <article className={`ticket-line card ${line.needsReview || !line.ingredientId ? "needs-review" : ""}`} key={line.id}>
                        <label className="ticket-include">
                          <input type="checkbox" checked={line.include} onChange={(event) => updateTicketLine(line.id, { include: event.target.checked })} />
                          <span>{Math.round(line.confidence * 100)}%</span>
                        </label>
                        <div className="ticket-line-main">
                          <input className="input" value={line.name} onChange={(event) => updateTicketLine(line.id, { name: event.target.value })} />
                          <select className="input" value={line.ingredientId} onChange={(event) => updateTicketLine(line.id, { ingredientId: event.target.value })}>
                            <option value="">Empatar con inventario</option>
                            {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                          </select>
                          <div className="ticket-line-grid">
                            <input className="input" inputMode="decimal" value={line.quantity} onChange={(event) => updateTicketLine(line.id, { quantity: event.target.value })} />
                            <input className="input" value={line.unit} onChange={(event) => updateTicketLine(line.id, { unit: event.target.value })} />
                            <input className="input" inputMode="decimal" value={line.unitPrice} onChange={(event) => updateTicketLine(line.id, { unitPrice: event.target.value })} />
                          </div>
                          <small>{line.rawText || "Renglon detectado por IA"}</small>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="inline-summary">
                    <ShoppingCart size={16} />
                    {ticketDraft.items.filter((line) => line.include).length} renglones - {money(ticketDraft.items.filter((line) => line.include).reduce((sum, line) => sum + toNumber(line.quantity) * toNumber(line.unitPrice), 0))}
                  </div>
                  <button className="btn" type="button" onClick={applyTicketPurchase} disabled={saving}>
                    <Check size={18} /> Aplicar compra
                  </button>
                </>
              )}
            </div>
          </section>
        )}

        {tab === "movimientos" && (
          <section className="panel-grid">
            <div className="section-title">
              <History size={18} />
              <div><strong>Movimientos recientes</strong><span>Entradas, salidas y conteos</span></div>
              <button type="button" onClick={() => exportInventory("movements")}><Download size={15} /> CSV</button>
            </div>
            <div className="movement-list">
              {movements.map((movement) => (
                <article className="movement-row card" key={movement.id}>
                  <div><strong>{movement.ingredient?.name || movement.ingredientId || "Producto"}</strong><span>{movementReason(movement.reason)}</span></div>
                  <small><UserRound size={13} /> {movementOperator(movement.reason)}</small>
                  <div><b>{movement.type || ""} {toNumber(movement.quantity).toLocaleString("es-MX")}</b><span>{safeDate(movement.createdAt)}</span></div>
                </article>
              ))}
              {movements.length === 0 && <div className="empty card">Sin movimientos recientes</div>}
            </div>
          </section>
        )}

        {tab === "reparto" && (
          <section className="panel-grid">
            <form className="card action-panel" onSubmit={handleTransfer}>
              <div className="section-title compact"><ArrowLeftRight size={18} /><div><strong>Reparto entre sucursales</strong><span>Funciona si esta sucursal es Bodega Central</span></div></div>
              <label className="field"><span>Producto origen</span><select className="input" value={transfer.ingredientId} onChange={(e) => setTransfer({ ...transfer, ingredientId: e.target.value })}>{items.map((item) => <option key={item.id} value={item.id}>{item.name} - {item.stock} {item.unit}</option>)}</select></label>
              <label className="field"><span>Destino</span><select className="input" value={transfer.toLocationId} onChange={(e) => setTransfer({ ...transfer, toLocationId: e.target.value })}><option value="">Selecciona sucursal</option>{locations.filter((loc) => loc.id !== session.locationId).map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}</select></label>
              <label className="field"><span>Cantidad</span><input className="input" inputMode="decimal" value={transfer.qty} onChange={(e) => setTransfer({ ...transfer, qty: e.target.value })} /></label>
              <label className="field"><span>Notas</span><input className="input" value={transfer.notes} onChange={(e) => setTransfer({ ...transfer, notes: e.target.value })} /></label>
              <div className="inline-summary"><Warehouse size={16} /> {currentTransferItem?.name || "Producto"} hacia otra sucursal</div>
              <button className="btn" disabled={saving}><ArrowLeftRight size={18} /> Registrar reparto</button>
            </form>
          </section>
        )}
      </section>

      {formOpen && (
        <div className="sheet-backdrop" role="dialog" aria-modal="true">
          <form className="sheet card" onSubmit={handleSaveItem}>
            <div className="sheet-head">
              <h2>{form.id ? "Editar producto" : "Nuevo producto"}</h2>
              <button className="icon-btn" type="button" onClick={() => setFormOpen(false)} aria-label="Cerrar"><X size={20} /></button>
            </div>
            <label className="photo-picker">
              {photoPreview ? <img src={photoPreview} alt="Vista previa" /> : <Camera size={34} />}
              <span><Upload size={16} /> Foto</span>
              <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} />
            </label>
            <div className="form-grid">
              <label className="field wide"><span>Nombre</span><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label className="field"><span>Unidad</span><input className="input" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></label>
              <label className="field"><span>Stock</span><input className="input" inputMode="decimal" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} /></label>
              <label className="field"><span>Minimo</span><input className="input" inputMode="decimal" value={form.minStock} onChange={(event) => setForm({ ...form, minStock: event.target.value })} /></label>
              <label className="field"><span>Costo</span><input className="input" inputMode="decimal" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} /></label>
              <label className="field wide"><span>Proveedor</span><select className="input" value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}><option value="">Sin proveedor</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
            </div>
            <button className="btn" disabled={saving}><Save size={18} />{saving ? "Guardando..." : "Guardar"}</button>
          </form>
        </div>
      )}

      {adjustment && (
        <div className="sheet-backdrop" role="dialog" aria-modal="true">
          <form className="sheet compact card" onSubmit={handleAdjust}>
            <div className="sheet-head">
              <h2>{adjustment.ingredient.name}</h2>
              <button className="icon-btn" type="button" onClick={() => setAdjustment(null)} aria-label="Cerrar"><X size={20} /></button>
            </div>
            <div className="segmented">
              {(["IN", "OUT", "ADJUST"] as const).map((mode) => (
                <button key={mode} type="button" className={adjustment.mode === mode ? "active" : ""} onClick={() => setAdjustment({ ...adjustment, mode })}>{mode === "IN" ? "Entrada" : mode === "OUT" ? "Salida" : "Conteo"}</button>
              ))}
            </div>
            <label className="field"><span>{adjustment.mode === "ADJUST" ? "Nuevo stock" : "Cantidad"}</span><input className="input" inputMode="decimal" value={adjustment.quantity} onChange={(event) => setAdjustment({ ...adjustment, quantity: event.target.value })} /></label>
            <button className="btn" disabled={saving}><Check size={18} /> Actualizar</button>
          </form>
        </div>
      )}

      {scannerOpen && (
        <div className="sheet-backdrop" role="dialog" aria-modal="true">
          <div className="sheet compact card">
            <div className="sheet-head"><h2>Escanear codigo</h2><button className="icon-btn" type="button" onClick={closeScanner}><X size={20} /></button></div>
            <video ref={videoRef} className="scanner-video" muted playsInline />
            <p className="muted">Apunta al codigo. Si tu Android no lo detecta, capturalo manualmente.</p>
          </div>
        </div>
      )}
    </main>
  );
}

function InventoryList({
  items,
  loading,
  onAdjust,
  onDelete,
  onEdit,
}: {
  items: Ingredient[];
  loading: boolean;
  onAdjust: (state: AdjustmentState) => void;
  onDelete: (item: Ingredient) => void;
  onEdit: (item: Ingredient) => void;
}) {
  if (loading) return <div className="empty card">Cargando inventario...</div>;
  if (items.length === 0) {
    return (
      <div className="empty card">
        <PackagePlus size={28} />
        <strong>Sin productos</strong>
        <span>No hay productos para esta vista.</span>
      </div>
    );
  }
  return (
    <section className="item-list">
      {items.map((item) => {
        const low = item.minStock > 0 && item.stock <= item.minStock;
        const coverage = item.minStock > 0 ? Math.min(100, Math.round((item.stock / item.minStock) * 100)) : 100;
        return (
          <article className={`item-card card ${low ? "low" : ""}`} key={item.id}>
            <div className="item-photo">{item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <Camera size={24} />}</div>
            <div className="item-main">
              <div>
                <h2>{item.name}</h2>
                <p>{item.supplier?.name || item.category?.name || "Sin proveedor"}</p>
              </div>
              <div className="stock-row">
                <strong>{toNumber(item.stock).toLocaleString("es-MX")} {item.unit}</strong>
                <span>Min {toNumber(item.minStock).toLocaleString("es-MX")}</span>
                <span>{money(item.cost)}</span>
                <span>Valor {money(toNumber(item.stock) * toNumber(item.cost))}</span>
              </div>
              <div className="stock-meter"><i style={{ width: `${coverage}%` }} /></div>
            </div>
            <div className="item-actions">
              <button className="icon-btn" type="button" onClick={() => onAdjust({ ingredient: item, mode: "IN", quantity: "1" })} aria-label="Entrada" title="Entrada"><Plus size={18} /></button>
              <button className="icon-btn" type="button" onClick={() => onAdjust({ ingredient: item, mode: "OUT", quantity: "1" })} aria-label="Salida" title="Salida"><Minus size={18} /></button>
              <button className="icon-btn" type="button" onClick={() => onAdjust({ ingredient: item, mode: "ADJUST", quantity: String(item.stock) })} aria-label="Conteo" title="Conteo"><ClipboardCheck size={18} /></button>
              <button className="icon-btn" type="button" onClick={() => onEdit(item)} aria-label="Editar" title="Editar"><Edit3 size={18} /></button>
              <button className="icon-btn danger-icon" type="button" onClick={() => onDelete(item)} aria-label="Eliminar" title="Eliminar"><Trash2 size={18} /></button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
