import { AccountShell } from '@/components/account/AccountUi';

export default function TermsPage() {
  return <AccountShell title="Términos del Mercadito">
    <article className="space-y-5 text-sm leading-relaxed">
      <p role="status" className="rounded-xl bg-amber-100 p-3 font-bold text-amber-900">Documento en revisión</p>
      <p>Última actualización [FECHA DE ÚLTIMA ACTUALIZACIÓN]</p>
      <p>Operador [RESPONSABLE]. Domicilio [DOMICILIO]. Contacto [CONTACTO DE ATENCIÓN].</p>
      <section><h2 className="font-bold">Clientes</h2><p>Proporciona datos de contacto y entrega correctos. Revisa productos, precios, envío y método de pago antes de confirmar. Cada comercio recibe su pedido. La aceptación y preparación dependen del comercio. Conserva tu código de entrega y compártelo al recibir.</p><p>Un pedido sin aceptación del comercio se cancela al transcurrir 15 minutos. Cuando corresponde un reembolso por cancelación de un pedido pagado en línea, incluye el total y el envío. [PLAZOS Y CANALES DE ACLARACIÓN POR DEFINIR].</p></section>
      <section><h2 className="font-bold">Comercios</h2><p>El comercio mantiene actualizado su catálogo, disponibilidad, precios, horarios y cobertura. Atiende la aceptación y preparación de sus pedidos y las solicitudes relacionadas con sus productos. [DATOS CONTRACTUALES, COMISIONES Y RESPONSABILIDADES POR DEFINIR].</p></section>
      <section><h2 className="font-bold">Repartidores independientes</h2><p>La participación se plantea como prestación de servicios independientes, sin relación laboral con el operador. El repartidor mantiene sus datos y autorizaciones actualizados, cuida los pedidos asignados y confirma la entrega con el código correspondiente. [CONDICIONES CONTRACTUALES, PAGO, SEGUROS Y ALCANCE DE RESPONSABILIDAD SUJETOS A REVISIÓN LEGAL].</p></section>
      <section><h2 className="font-bold">Privacidad y atención</h2><p>El uso de datos se describe en el aviso de privacidad. Para consultas o controversias utiliza [CONTACTO DE ATENCIÓN]. [DOMICILIO Y MECANISMOS DE SOLUCIÓN POR DEFINIR].</p></section>
    </article>
  </AccountShell>;
}
