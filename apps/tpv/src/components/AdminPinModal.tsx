"use client";
import { useState } from "react";
import api from "@/lib/api";

type Props = {
  permission: string;
  permissionLabel: string;
  onApprove: (overrideToken: string) => void;
  onCancel: () => void;
};

/**
 * Modal de override por PIN de administrador.
 *
 * Flujo:
 * 1. Empleado intenta una acción → backend responde 403 PERMISSION_DENIED.
 * 2. PermissionGateContext abre este modal pasando { permission, label }.
 * 3. Otro empleado con permiso entra su PIN.
 * 4. Llamamos POST /api/employees/authorize-action.
 * 5. Si OK, devolvemos el overrideToken al gate, que reintenta la acción
 *    original con header X-Permission-Override.
 */
export default function AdminPinModal({ permission, permissionLabel, onApprove, onCancel }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authorizedBy, setAuthorizedBy] = useState<{ name: string; role: string } | null>(null);

  function appendDigit(d: string) {
    if (loading) return;
    setError("");
    if (pin.length < 6) setPin((p) => p + d);
  }

  function backspace() {
    if (loading) return;
    setError("");
    setPin((p) => p.slice(0, -1));
  }

  async function submit() {
    if (pin.length < 4 || loading) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/api/employees/authorize-action", {
        pin,
        permission,
      });
      setAuthorizedBy(data.authorizedBy);
      // Pequeño delay para que el usuario vea quién autorizó antes de cerrar.
      setTimeout(() => onApprove(data.overrideToken), 600);
    } catch (e: any) {
      setError(e?.response?.data?.error || "Autorización fallida");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-pin-title"
    >
      <div className="w-full max-w-sm bg-surf-1 border border-bd rounded-3xl p-6 shadow-2xl">
        <div className="text-center mb-5">
          <div className="eyebrow !text-iris-500">AUTORIZACIÓN REQUERIDA</div>
          <h2 id="admin-pin-title" className="text-xl font-black mt-1 text-tx-pri">
            {permissionLabel}
          </h2>
          <p className="text-xs text-tx-mut mt-2">
            Pide a un administrador que ingrese su PIN para autorizar esta acción.
          </p>
        </div>

        <div className="flex justify-center gap-3 mb-4 h-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-all ${
                i < pin.length ? "bg-iris-500" : "bg-surf-3 border border-bd"
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-center text-xs font-bold text-danger mb-3" role="alert">
            {error}
          </p>
        )}

        {authorizedBy ? (
          <p className="text-center text-sm font-bold text-success py-4">
            ✓ Autorizado por {authorizedBy.name}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => appendDigit(String(n))}
                  className="py-4 rounded-xl text-xl font-black bg-surf-2 border border-bd hover:bg-surf-3 active:scale-95 transition-all"
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPin("")}
                className="py-4 rounded-xl text-sm font-bold bg-surf-2 border border-bd text-tx-mut hover:bg-surf-3 active:scale-95 transition-all"
              >
                Borrar
              </button>
              <button
                type="button"
                onClick={() => appendDigit("0")}
                className="py-4 rounded-xl text-xl font-black bg-surf-2 border border-bd hover:bg-surf-3 active:scale-95 transition-all"
              >
                0
              </button>
              <button
                type="button"
                onClick={backspace}
                aria-label="Borrar último dígito"
                className="py-4 rounded-xl text-lg font-bold bg-surf-2 border border-bd text-tx-mut hover:bg-surf-3 active:scale-95 transition-all"
              >
                ⌫
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 py-3 rounded-xl text-sm font-bold bg-surf-2 border border-bd text-tx-sec hover:bg-surf-3"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pin.length < 4 || loading}
                className="flex-[2] py-3 rounded-xl text-sm font-black bg-iris-500 text-white shadow-lg shadow-iris-glow active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Validando..." : "Autorizar"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
