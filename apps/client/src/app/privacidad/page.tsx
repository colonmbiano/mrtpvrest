import { AccountShell } from '@/components/account/AccountUi';

export default function PrivacyPage() {
  return <AccountShell title="Aviso de privacidad">
    <article className="space-y-5 text-sm leading-relaxed">
      <p role="status" className="rounded-xl bg-amber-100 p-3 font-bold text-amber-900">Documento en revisión</p>
      <p>Última actualización [FECHA DE ÚLTIMA ACTUALIZACIÓN]</p>
      <section><h2 className="font-bold">Responsable</h2><p>[RESPONSABLE], con domicilio en [DOMICILIO], define el tratamiento de los datos del Mercadito Colorines.</p></section>
      <section><h2 className="font-bold">Datos y finalidades</h2><p>Recabamos nombre, teléfono, correo, dirección y ubicación GPS para crear cuentas, gestionar pedidos, calcular cobertura, coordinar entregas, verificar accesos y atender solicitudes. La ubicación se obtiene con permiso del dispositivo. Los datos de pago se procesan mediante la pasarela correspondiente.</p></section>
      <section><h2 className="font-bold">Comercios y repartidores</h2><p>Compartimos con el comercio y el repartidor asignado la información necesaria para preparar, entregar y atender tu pedido. [DETALLE DE PROVEEDORES, TRANSFERENCIAS Y CONSERVACIÓN POR DEFINIR].</p></section>
      <section><h2 className="font-bold">Tus derechos</h2><p>Puedes solicitar acceso, rectificación, cancelación u oposición al tratamiento, así como revocar tu consentimiento o limitar su uso, en [CORREO ARCO]. [PROCEDIMIENTO DE IDENTIFICACIÓN Y ATENCIÓN POR DEFINIR].</p></section>
      <section><h2 className="font-bold">Cambios</h2><p>Las actualizaciones se publicarán en esta página. [MEDIO DE NOTIFICACIÓN POR DEFINIR].</p></section>
      <p><a href="https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf" target="_blank" rel="noopener noreferrer" className="underline">Consultar la legislación de protección de datos</a></p>
    </article>
  </AccountShell>;
}
