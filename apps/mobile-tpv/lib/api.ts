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
  const token = await getItem(StorageKeys.accessToken);
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
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
