import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.mrtpvrest.com";

export function makeAuthApi(token: string) {
  return axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${token}` },
  });
}
