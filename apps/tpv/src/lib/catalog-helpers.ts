import type { Product } from "@/store/ticketStore";

export const CATALOG_REFRESH_EVENT = "tpv:catalog:refresh";

export function itemsLabel(n: number): string {
  return `${n} ${n === 1 ? "item" : "items"}`;
}

export function fuzzyFilter(products: Product[], query: string): Product[] {
  const normalizedQuery = normalize(query);
  return products
    .map((product) => ({
      product,
      score: fuzzyScore(normalize(product.name), normalizedQuery),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
    .map((item) => item.product);
}

export function fuzzyScore(value: string, query: string): number {
  if (!query) return 1;
  if (value.includes(query)) return 100 - value.indexOf(query);

  let score = 0;
  let queryIndex = 0;
  for (let i = 0; i < value.length && queryIndex < query.length; i += 1) {
    if (value[i] === query[queryIndex]) {
      score += 3;
      queryIndex += 1;
    }
  }
  return queryIndex === query.length ? score : 0;
}

export function getCategoryIdOrName(category: unknown): string {
  if (typeof category === "string") return category;
  if (category && typeof category === "object") {
    if ("id" in category && typeof (category as any).id === "string") return (category as any).id;
    if ("name" in category && typeof (category as any).name === "string") return (category as any).name;
  }
  return "";
}

export function sameCategory(a: unknown, b: unknown): boolean {
  const left = normalize(a);
  const right = normalize(b);
  return left === right || left.includes(right) || right.includes(left);
}

export function normalize(value: unknown): string {
  if (typeof value === "string") {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }
  if (value && typeof value === "object" && "name" in value) {
    return normalize((value as { name?: unknown }).name);
  }
  return "";
}

export function categoryTone(name: unknown): "food" | "wings" | "snack" | "drink" | "neutral" {
  const normalized = normalize(name);
  if (normalized.includes("bebida") || normalized.includes("agua") || normalized.includes("refresco")) return "drink";
  if (normalized.includes("alita") || normalized.includes("boneless")) return "wings";
  if (normalized.includes("antojit") || normalized.includes("taco") || normalized.includes("nacho")) return "snack";
  if (normalized.includes("hamburg") || normalized.includes("burger") || normalized.includes("comida")) return "food";
  return "neutral";
}

