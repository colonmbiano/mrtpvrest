# Administración de Mercadito Colorines

Entra como SuperAdmin a `https://saas.mrtpvrest.com/marketplace`. La sección
**Administrar Mercadito Colorines** permite guardar:

- Comisión para las cotizaciones nuevas (0–100%, en centésimas de porcentaje).
- Radio de entrega por sucursal (0.1–5 km); prevalece cualquier límite menor del negocio.
- Aceptación de pedidos nuevos y disponibilidad de domicilio.

Los cambios se guardan con versión en `global_configs` y auditoría transaccional en
`system_logs`. Dos sesiones no pueden sobrescribirse: la segunda debe actualizar
los valores. Las lecturas fallidas bloquean las solicitudes del marketplace con
503; nunca se ignora una pausa por un fallo de configuración.

Pausar pedidos bloquea cotización y creación, manteniendo seguimiento, historial,
códigos y webhooks de pedidos existentes. Las cotizaciones ya emitidas conservan
la comisión original. El domicilio y el radio se vuelven a comprobar al confirmar.

Hasta el primer guardado se respeta la configuración desplegada en Railway.
Después prevalecen los cuatro controles del panel. No se modifica `process.env`:
cada solicitud tiene su propio contexto, y los servicios se renuevan al cambiar
comisión, radio o disponibilidad de domicilio.

La tarjeta de integraciones muestra solo presencia de credenciales y activación
del servidor de cuentas; no expone valores privados ni certifica la autorización
de dominios de los proveedores. Las claves privadas, Turnstile público del cliente
y la huella de Play siguen en la configuración segura de la publicación.

Los comercios se aprueban o suspenden en **Comercios del directorio**. Productos,
precios y operación del negocio siguen en el panel administrativo de cada comercio.
