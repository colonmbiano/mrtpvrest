// Shared TypeScript types for MRTPVREST monorepo

export type Plan = "TRIAL" | "BASIC" | "PRO" | "UNLIMITED";

export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "EXPIRED"
  | "SUSPENDED";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string;
  logoUrl: string | null;
  createdAt: string;
}

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
