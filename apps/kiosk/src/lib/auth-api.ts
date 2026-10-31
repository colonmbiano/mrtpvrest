import axios from "axios";
// Misma resolución que el cliente principal (incluye la copia aislada).
import { API_URL } from "./api";

export function makeAuthApi(token: string) {
  return axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${token}` },
  });
}
