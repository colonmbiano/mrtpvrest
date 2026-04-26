"use client";

export type Category = { id: string; name: string };

export default function CategoryTabs({
  categories,
  selected,
  onSelect,
  showAll = true,
}: {
  categories: Category[];
  selected: string;
  onSelect: (id: string) => void;
  showAll?: boolean;
}) {
  const items: Category[] = showAll
    ? [{ id: "all", name: "Todos" }, ...categories]
    : categories;

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
      {items.map((c) => {
        const active = selected === c.id;
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className="px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all"
            style={{
              background: active ? "var(--brand)" : "transparent",
              color: active ? "var(--brand-fg)" : "var(--text-secondary)",
              border: active ? "1px solid var(--brand)" : "1px solid var(--border-strong)",
              letterSpacing: "0.08em",
            }}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
