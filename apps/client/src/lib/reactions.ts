"use client";
// Reacciones ("me gusta") anónimas a platillos. El cliente no inicia sesión:
// se identifica con un id generado en su navegador (localStorage). Guardamos
// también qué platillos marcó para pintar el corazón lleno al volver.

import { getApiUrl } from "./config";

const CLIENT_KEY = "mb_client_id";
const REACTED_KEY = "mb_reacted";

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* noop */ }
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getClientId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(CLIENT_KEY);
  if (!id) {
    id = newId();
    localStorage.setItem(CLIENT_KEY, id);
  }
  return id;
}

export function getReactedSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(REACTED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveReactedSet(s: Set<string>) {
  try {
    localStorage.setItem(REACTED_KEY, JSON.stringify([...s]));
  } catch { /* almacenamiento lleno / privado: no es crítico */ }
}

export function hasReacted(itemId: string): boolean {
  return getReactedSet().has(itemId);
}

// Alterna la reacción del navegador actual. Devuelve el conteo real del server
// o null si falló (el llamador revierte su UI optimista).
export async function toggleReaction(
  slug: string,
  itemId: string
): Promise<{ reactionCount: number; reacted: boolean } | null> {
  const set = getReactedSet();
  const on = !set.has(itemId);
  const clientId = getClientId();
  try {
    const res = await fetch(`${getApiUrl()}/api/store/menu/${itemId}/react?r=${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, on }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (on) set.add(itemId);
    else set.delete(itemId);
    saveReactedSet(set);
    return data;
  } catch {
    return null;
  }
}
