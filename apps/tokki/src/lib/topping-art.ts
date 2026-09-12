export function toppingCell(name: string): number | null {
  const value = name.toLowerCase();
  if (value.includes("sin ")) return null;
  if (value.includes("tapioca")) return 0;
  if (value.includes("popping") || value.includes("boba")) return 1;
  if (value.includes("jelly")) return 2;
  if (value.includes("aloe")) return 3;
  if (value.includes("cheese")) return 5;
  if (value.includes("cloud") || value.includes("crema batida")) return 4;
  return null;
}
