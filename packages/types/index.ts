// Shared TypeScript types for MRTPVREST monorepo
// Kept in sync with packages/database/prisma/schema.prisma. Enum string literals
// below match the Prisma enums exactly (no renames); frontend must not redefine
// divergent versions.

// ── Enums ──────────────────────────────────────────────────────────────────

export type Role = "CUSTOMER" | "ADMIN" | "KITCHEN" | "SUPER_ADMIN";

export type SubscriptionStatus =
  | "TRIAL"
  | "ACTIVE"
  | "PAST_DUE"
  | "SUSPENDED"
  | "CANCELLED"
  | "EXPIRED";

export type InvoiceStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

export type BusinessType = "RESTAURANT" | "RETAIL" | "BAR" | "CAFE";

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "ON_THE_WAY"
  | "DELIVERED"
  | "CANCELLED";

export type PaymentMethod =
  | "CASH"
  | "CARD_PRESENT"
  | "TRANSFER"
  | "COURTESY"
  | "PENDING"
  | "CARD"
  | "OXXO"
  | "SPEI"
  | "CASH_ON_DELIVERY";

export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

// ── Core entities (Prisma parity) ─────────────────────────────────────────

export interface Plan {
  id: string;
  name: string;          // "BASIC" | "PRO" | "UNLIMITED"
  displayName: string;
  price: number;
  trialDays: number;
  maxLocations: number;
  maxEmployees: number;
  hasKDS: boolean;
  hasLoyalty: boolean;
  hasInventory: boolean;
  hasReports: boolean;
  hasAPIAccess: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  tenantId: string | null;
  planId: string;
  plan?: Plan;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  pausedAt: string | null;
  priceSnapshot: number;
  externalId: string | null;
  paymentGateway: string | null; // "MANUAL" | "STRIPE" | "MERCADOPAGO"
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  paidAt: string | null;
  periodStart: string;
  periodEnd: string;
  externalId: string | null;
  createdAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string;
  logoUrl: string | null;
  primaryColor: string | null;
  onboardingStep: number;
  onboardingDone: boolean;
  businessType: string | null;
  isOnboarded: boolean;
  activeModules: unknown;
  emailVerifiedAt: string | null;
  subscription?: Subscription | null;
  createdAt: string;
  updatedAt: string;
}

export interface Restaurant {
  id: string;
  tenantId: string | null;
  slug: string;
  name: string;
  domain: string | null;
  isActive: boolean;
  logoUrl: string | null;
  accentColor: string | null;
  businessType: string; // "RESTAURANT" | "RETAIL" | "GROCERY"
  aiApiKey: string | null;
  aiKeyValidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Location {
  id: string;
  restaurantId: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  businessType: BusinessType;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  tenantId: string | null;
  restaurantId: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── SaaS admin aggregates ─────────────────────────────────────────────────

export interface MrrBreakdown {
  mrr: number;
  activeCount: number;
  byPlan: Record<string, { count: number; mrr: number; displayName?: string }>;
}

export interface SaasHealth {
  tenantCount: number;
  activeSubscriptions: number;
  orders24h: number;
  gmv24h: number;
  metrics: Array<{ label: string; value: string; pct: number; color?: string }>;
}

export interface SaasTopTenant {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  plan: string | null;
  planDisplay: string | null;
  restaurants: number;
  mrr: number;
}

export interface SaasApiKey {
  id: string;
  tenantId: string | null;
  name: string;
  prefix: string;
  scopes: string[];
  active: boolean;
  lastUsedAt: string | null;
  revokedAt: string | null;
  requests24h: number;
  createdAt: string;
  // Only present on POST response (one-time reveal).
  key?: string;
}

export interface SaasLog {
  id: string;
  tenantId: string | null;
  level: "INFO" | "WARN" | "ERROR" | "OK";
  message: string;
  context: string | null;
  createdAt: string;
}

// ── API envelopes ────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}
