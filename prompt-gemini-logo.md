# Contexto del Problema: Bug en Onboarding Checklist
El usuario ha completado el proceso de subir el logo en el Wizard de Onboarding del panel de Admin, pero el checklist principal ("Configura tu restaurante") sigue mostrando el paso "Sube tu logo" como incompleto (4/5 tareas completadas).

## Hipótesis Técnicas a Investigar
1. **Mismatch de Modelos:** El logo se puede estar guardando en `Restaurant.logoUrl` pero el frontend evalúa `Tenant.logoUrl` (o viceversa). 
2. **Estado Desincronizado:** El endpoint de subida de imagen (Cloudinary) termina con éxito, pero la mutación posterior hacia la DB en Supabase no está actualizando el campo o no está forzando la revalidación de la data en el cliente.
3. **Condición Errónea:** El componente del checklist está esperando una variable específica (ej. un booleano `hasLogo` o que `onboardingStep` avance) y no simplemente comprobando `if (logoUrl)`.

## Pasos para la Reparación
1. **Localizar el Componente:** Busca en `apps/admin` el componente que renderiza el checklist del Onboarding (el texto exacto es "Configura tu restaurante", "Sube tu logo", "4/5 tareas completadas").
2. **Analizar la Condición:** Revisa qué variable determina si ese paso tiene el `checkmark` verde.
3. **Revisar la Acción de Subida:** Busca el endpoint o server action que procesa la subida del logo y verifica a qué tabla de Prisma (`Tenant` o `Restaurant`) está guardando la URL.
4. **Implementar el Fix:** 
   - Asegúrate de que la evaluación en el frontend coincida con donde realmente se guarda la URL.
   - Si es necesario, actualiza la llamada a la API para que envíe correctamente el `tenantId` o `restaurantId`.
   - Asegura que el estado se revalide (`router.refresh()` o actualización del store) tras la subida.

**Regla estricta:** No uses placeholders, escribe el código completo de los archivos que modifiques.
