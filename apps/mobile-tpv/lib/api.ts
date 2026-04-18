import axios, { AxiosInstance } from 'axios';
import { getItem, StorageKeys } from './storage';

export const API_BASE_URL = 'https://api.mrtpvrest.com';

/**
 * Shared axios instance pointed at the mrtpvrest API.
 *
 * An interceptor pulls the current accessToken from SecureStore on every
 * request, so callers don't have to thread the token manually. If there is
 * no token yet (e.g. during login itself), the Authorization header is
 * simply omitted.
 */
export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  // Prefer the employee session token once the employee has clocked in;
  // otherwise fall back to the device's accessToken (admin pairing token).
  const [employeeToken, accessToken, locationId] = await Promise.all([
    getItem(StorageKeys.employeeToken),
    getItem(StorageKeys.accessToken),
    getItem(StorageKeys.locationId),
  ]);
  const token = employeeToken ?? accessToken;

  config.headers = config.headers ?? {};
  const headers = config.headers as Record<string, string>;
  if (token) headers.Authorization = `Bearer ${token}`;
  // Backend tenant middleware reads x-location-id to scope multi-tenant queries.
  if (locationId) headers['x-location-id'] = locationId;

  return config;
});

/**
 * Shape of a single location entry returned by GET /api/auth/my-locations.
 * We only depend on the fields we actually render; extra fields pass through.
 */
export interface LocationDto {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  isActive?: boolean;
}

export async function fetchMyLocations(): Promise<LocationDto[]> {
  const { data } = await api.get('/api/auth/my-locations');
  // Accept either a raw array or a wrapper { locations: [...] }.
  if (Array.isArray(data)) return data as LocationDto[];
  if (Array.isArray(data?.locations)) return data.locations as LocationDto[];
  if (Array.isArray(data?.data)) return data.data as LocationDto[];
  return [];
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    restaurantId: string;
    restaurantSlug: string;
    [k: string]: unknown;
  };
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/api/auth/login', {
    email,
    password,
  });
  return data;
}

export interface EmployeeDto {
  id: string;
  name: string;
  role: string;
  photo?: string | null;
  locationId: string;
  [k: string]: unknown;
}

export interface EmployeeLoginResponse {
  employee: EmployeeDto;
  token: string;
}

/**
 * POST /api/employees/login — verifies a PIN against the currently-paired
 * location. The x-location-id header is injected automatically by the
 * request interceptor. Throws on 401 (wrong PIN) or network errors.
 */
export async function employeePinLogin(
  pin: string,
): Promise<EmployeeLoginResponse> {
  const { data } = await api.post<EmployeeLoginResponse>(
    '/api/employees/login',
    { pin },
  );
  return data;
}
