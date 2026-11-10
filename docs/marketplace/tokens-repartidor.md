# Tokens del repartidor

El acceso del repartidor usa una clave dedicada MARKETPLACE_COURIER_JWT_SECRET. Cada petición comprueba la cuenta y rechaza un token cuyo iat sea anterior a passwordChangedAt. Una cuenta anterior a la migración conserva passwordChangedAt null hasta su primer cambio o restablecimiento.

POST /api/marketplace/identity/password/change exige sesión, contraseña actual y contraseña nueva. POST /password/reset exige el enlace de recuperación de un solo uso. Ambos registran passwordChangedAt y revocan sesiones. El cambio autenticado también consume los enlaces de recuperación pendientes.

La emisión de courier conserva fracciones de segundo en iat para distinguir el token anterior de un acceso nuevo durante el mismo segundo. NumericDate permite valores fraccionarios según RFC 7519.

## Retirar tokens de tienda

Configura MARKETPLACE_ACCEPT_STORE_JWT=false cuando los compradores y el personal ya obtengan tokens específicos del Mercadito y hayas comprobado sus accesos. Antes de activarlo, configura y verifica las claves dedicadas de buyer y staff, separadas de JWT_SECRET. Reinicia las instancias para aplicar la variable.

Con false se rechaza el token de tienda en los resolvers del Mercadito y se mantiene la autenticación dedicada. La app nativa de repartidor usa su propio token de courier. Los JWT de tienda conservan su uso en las APIs propias del TPV. Si una integración pendiente depende del modo de transición, migra esa integración y repite la verificación antes de retirar la compatibilidad.

Prueba reproducible del modo desactivado en apps/backend/scripts/marketplace-jwt.test.cjs.

Referencia técnica [RFC 7519](https://www.rfc-editor.org/rfc/rfc7519#section-2).
