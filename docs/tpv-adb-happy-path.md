# TPV happy path en tablet por ADB

Este flujo ejecuta una validación asistida del TPV Android sobre una tablet ya vinculada, sin reinstalar APK ni tocar la configuración persistente del dispositivo. Está pensado para producción, así que automatiza solo lo estable y deja confirmaciones humanas justo antes de pasos de riesgo.

## Qué hace

- Verifica que `adb` vea el dispositivo y que `com.mrtpvrest.tpv` esté instalado.
- Abre la app, detecta el estado visible (`setup`, `locked`, `hub`, `menu`, `payment`) y toma evidencia.
- Puede ingresar el PIN por ADB si se pasa `-EmployeePin`.
- Navega el tipo de orden, abre el cobro y selecciona `Tarjeta`.
- Toma capturas antes y después del cobro.
- Guarda `logcat`, screenshots, dumps XML de UI y un `README.md` con el resumen de la corrida.

## Qué no hace

- No rebindea la tablet ni cambia `/setup`.
- No intenta leer de forma invasiva si el dispositivo tiene un override local de `apiBaseUrl`.
- No adivina qué producto cobrar en producción si no le das `-ProductText`; en ese caso te deja seleccionarlo manualmente.
- No confirma por sí solo el éxito de una terminal externa si el proveedor abre otra app o diálogo no visible en el árbol UI.

## Uso recomendado

Desde la raíz del repo:

```powershell
./scripts/tpv-adb-happy-path.ps1 `
  -DeviceId ADNKCP3324400995 `
  -EmployeePin 1228 `
  -OrderType TAKEOUT `
  -ProductText "Agua Natural"
```

Si no quieres que el script meta el PIN o el producto automáticamente:

```powershell
./scripts/tpv-adb-happy-path.ps1 -DeviceId ADNKCP3324400995
```

Modo híbrido recomendado para esta tablet/WebView:

```powershell
./scripts/tpv-adb-happy-path.ps1 `
  -DeviceId ADNKCP3324400995 `
  -OrderType TAKEOUT `
  -ManualCatalog
```

Ese modo deja manual la selección de categoría/producto y automatiza el resto del flujo con evidencia.

## Parámetros útiles

- `-DeviceId`: dispositivo ADB objetivo.
- `-EmployeePin`: PIN de 4 dígitos para login automático.
- `-OrderType`: `TAKEOUT`, `DINE_IN` o `DELIVERY`. El default es `TAKEOUT` porque reduce riesgo operativo.
- `-ProductText`: texto visible del producto a cobrar. Si no se pasa, la selección queda manual.
- `-ArtifactsRoot`: carpeta base para screenshots, XML y logs.
- `-SkipLaunch`: reutiliza la pantalla actual en lugar de relanzar la app.
- `-SkipLogcat`: evita grabar `logcat`.
- `-ManualCatalog`: pausa para que el operador elija categoría y producto manualmente antes de retomar cobro y evidencia.

## Artifacts

Cada corrida crea una carpeta en `artifacts/tpv-adb/<timestamp>/` con:

- `00-initial.png`, `01-after-login.png`, etc.
- `*.xml`: dumps de `uiautomator`.
- `*.json`: metadatos por snapshot, incluyendo textos visibles y estado detectado.
- `device.log`: captura de `adb logcat`.
- `README.md`: resumen operativo de la corrida.

## Criterio operativo

Antes de confirmar el cobro real, el operador debe revisar en la tablet:

- sucursal correcta,
- terminal correcta,
- producto correcto,
- monto correcto,
- retorno exitoso al TPV después del flujo de terminal.

Si la app cae en `setup`, el script aborta a propósito.
