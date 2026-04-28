"use client";

export function ForbiddenScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center bg-gray-950">
      <span className="text-6xl">🔒</span>
      <h1 className="text-2xl font-black text-white">Módulo Kiosko no activado</h1>
      <p className="text-gray-400 max-w-sm">
        Este restaurante no tiene el módulo Kiosko habilitado en su plan. Contacta al administrador.
      </p>
    </div>
  );
}

export function NoProviderScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center bg-gray-950">
      <span className="text-6xl">💳</span>
      <h1 className="text-2xl font-black text-white">Pasarela de pago no configurada</h1>
      <p className="text-gray-400 max-w-sm">
        El administrador debe activar al menos una pasarela (MercadoPago, Stripe, etc.) en Admin → Integraciones.
      </p>
      <button
        onClick={onBack}
        className="mt-4 px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-sm transition-colors"
      >
        Volver al carrito
      </button>
    </div>
  );
}

export function SuccessScreen({ orderId, onReset }: { orderId: string | null; onReset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center bg-gray-950">
      <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center text-5xl">✅</div>
      <h1 className="text-3xl font-black text-white">¡Pedido confirmado!</h1>
      {orderId && <p className="text-gray-400 text-sm">Orden #{orderId.slice(-6).toUpperCase()}</p>}
      <p className="text-gray-300">Tu pedido está en camino a la cocina. Espera tu turno.</p>
      <button
        onClick={onReset}
        className="mt-4 px-8 py-3 bg-green-500 hover:bg-green-400 text-black font-black rounded-2xl text-lg transition-colors"
      >
        Nuevo pedido
      </button>
    </div>
  );
}

export function ErrorScreen({ onReset }: { onReset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center bg-gray-950">
      <div className="w-24 h-24 rounded-full bg-red-500/20 flex items-center justify-center text-5xl">❌</div>
      <h1 className="text-3xl font-black text-white">Error en el pago</h1>
      <p className="text-gray-300">El pago no pudo procesarse. Intenta nuevamente.</p>
      <button
        onClick={onReset}
        className="mt-4 px-8 py-3 bg-red-500 hover:bg-red-400 text-black font-black rounded-2xl text-lg transition-colors"
      >
        Intentar de nuevo
      </button>
    </div>
  );
}

export function PaymentScreen({
  checkoutUrl,
  paymentProvider,
  onReset,
}: {
  checkoutUrl: string;
  paymentProvider: string | null;
  onReset: () => void;
}) {
  const providerLabel = paymentProvider === "STRIPE" ? "Stripe"
    : paymentProvider === "MERCADOPAGO" ? "MercadoPago"
    : "pasarela";
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center bg-gray-950">
      <div className="w-24 h-24 rounded-full bg-blue-500/20 flex items-center justify-center text-5xl">📲</div>
      <h1 className="text-3xl font-black text-white">Escanea para pagar</h1>
      <p className="text-gray-300 max-w-sm">
        Toca el botón para pagar con {providerLabel}, o escanea el código QR que aparece en tu celular.
      </p>
      <a
        href={checkoutUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="px-8 py-4 bg-blue-500 hover:bg-blue-400 text-white font-black rounded-2xl text-lg transition-colors"
      >
        Pagar con {providerLabel} →
      </a>
      <button
        onClick={onReset}
        className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
      >
        Cancelar y volver
      </button>
    </div>
  );
}
