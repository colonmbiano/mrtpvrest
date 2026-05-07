// Tipos del lado admin que reflejan los payloads reales del backend.
// Mantener en sync con los routes en apps/backend/src/routes/admin.routes.js
// y tenant.routes.js. No reproducir aquí campos del schema Prisma — solo
// lo que el endpoint efectivamente serializa.

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
  tenantId?: string | null;
  restaurantId?: string | null;
}

export interface AdminRestaurant {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  accentColor: string | null;
  businessType?: string;
  isActive?: boolean;
}

export interface AdminLocation {
  id: string;
  name: string;
  slug?: string;
  address?: string | null;
  isActive?: boolean;
  restaurantId?: string;
}

export interface AdminBrandConfig {
  name: string;
  logoUrl: string | null;
  accentColor?: string | null;
}

// Respuesta de GET /api/tenant/me (pertinente al sidebar).
export interface TenantMeResponse {
  restaurants: AdminRestaurant[];
}
