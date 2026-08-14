/**
 * Banda de mesa (QR de autoservicio).
 *
 * Cuando el comensal llega por el QR pegado en la mesa (`?mesa=N&l=<sucursal>`),
 * el pedido queda fijo a esa mesa — pero hasta ahora eso solo se veía DENTRO del
 * checkout, así que la tienda se abría idéntica a la de domicilio y nadie sabía
 * que estaba pidiendo "para la mesa 1".
 *
 * Va en el flujo normal del documento, ARRIBA del header de cada tema. A
 * propósito no es sticky: los tres temas tienen `header sticky top-0` y una
 * barra de categorías con offsets fijos (`top-[116px]`, `top-[158px]`…), así que
 * una banda pegada al viewport se les encimaría. Al scrollear se va y el header
 * del tema toma el top como siempre.
 *
 * Server component (sin hooks): se renderiza en el HTML inicial, así que la mesa
 * está visible desde el primer pintado, sin esperar hidratación.
 */
export function DineInBanner({ table, primary }: { table: string; primary: string }) {
  return (
    <div
      className="w-full border-b bg-white px-4 py-3"
      style={{ borderColor: `${primary}33` }}
      role="status"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg"
          style={{ background: `${primary}1f` }}
          aria-hidden
        >
          🍽
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black leading-tight text-gray-900">
            Estás pidiendo para la{' '}
            <span style={{ color: primary }}>Mesa {table}</span>
          </p>
          <p className="mt-0.5 text-[11px] font-bold leading-snug text-gray-500">
            Tu pedido entra a cocina con tu mesa puesta. No necesitas llamar al mesero.
          </p>
        </div>
      </div>
    </div>
  );
}
