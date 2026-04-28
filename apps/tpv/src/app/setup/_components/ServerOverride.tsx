type Props = {
  serverUrl: string;
  onChange: (v: string) => void;
  onApply: () => void;
};

export default function ServerOverride({ serverUrl, onChange, onApply }: Props) {
  return (
    <div className="mt-6 text-center">
      <details>
        <summary
          className="text-[11px] font-bold uppercase tracking-widest cursor-pointer inline-block"
          style={{ color: "var(--text-muted)" }}
        >
          Servidor avanzado
        </summary>
        <div className="mt-3 flex items-center gap-2">
          <input
            value={serverUrl}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://api.example.com"
            className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
          <button
            onClick={onApply}
            className="px-4 py-2 rounded-lg text-xs font-bold"
            style={{
              background: "var(--surface-3)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          >
            Aplicar
          </button>
        </div>
      </details>
    </div>
  );
}
