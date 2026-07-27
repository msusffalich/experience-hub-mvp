# Auditoria integral: Vibeapp -> servidor -> Supabase -> VibePWA

Fecha: 2026-07-26  
Estado: diagnostico; no desplegar correcciones parciales  
Alcance: capturas nativas de Vibeapp, API de VibePWA, Supabase Storage,
tablas remotas y lectura en VibePWA.

## Resultado ejecutivo

El flujo no es confiable hoy para una captura multimedia dentro de una
experiencia abierta. La evidencia de iPhone confirma que una foto suelta llega,
pero la misma foto vinculada a una experiencia recibe `HTTP 502` y bloquea el
envio completo de la experiencia. El resultado visible es una experiencia sin
adjuntos o una cola que se queda reintentando.

No es un fallo de la foto, del tamano del archivo ni de la pantalla. Es una
combinacion de dos problemas de servidor:

1. Vibeapp sube primero el archivo y envia la experiencia despues. Cuando el
   archivo lleva el id local de una experiencia todavia inexistente, la escritura
   del activo puede chocar con la clave foranea de `assets.experience_id`.
2. El servidor tiene tres caminos distintos que escriben la relacion entre un
   activo y una experiencia. Solo uno aplica compatibilidad completa para
   columnas de adopcion. Otro oculta errores y permite devolver una experiencia
   sin sus adjuntos.

La migracion de `adopted_at` fue necesaria, pero no resolvio la causa completa:
el orden de llegada y la duplicacion de escritores siguen presentes.

## Evidencia observada

- Handcheck Vibeapp 0.5.34+656, 2026-07-26:
  - Foto suelta, sin experiencia: sincroniza correctamente.
  - Foto dentro de `Prueba 1` y `Prueba 2`: `Media HTTP 502` con
    `asset_evidence_remote_write_failed`.
  - Ubicacion del mismo dispositivo: sincroniza correctamente.
- Captura de pantalla `Screenshot 2026-07-26 at 11.49.48 AM.png`:
  ambas experiencias permanecen en `Sincronizando`, con un archivo y dos
  eventos, pero sin envio completo al servidor.
- El cliente nativo envia cada adjunto a `POST /api/media` antes de enviar la
  experiencia a `POST /api/experiences`. Si `/api/media` falla, no ejecuta el
  segundo paso. Esto se ve en `vibeapp/lib/main.dart`.

## Recorrido real por escenario

| Escenario | Entrada de Vibeapp | Destino esperado | Estado auditado | Riesgo actual |
| --- | --- | --- | --- | --- |
| Texto o voz humana suelta | `/api/integration/ingest` | experiencia candidata | Parcialmente separado | El contrato actual crea experiencia; debe alinearse con la bandeja de capturas y la decision de producto. |
| Foto, video, audio o documento suelto | `/api/media` | `assets`, estado `inbox` | Funciona en la prueba reciente | Depende de que la fila `assets` se escriba tras Storage. |
| Multimedia dentro de experiencia abierta | `/api/media` y luego `/api/experiences` | activo adoptado y experiencia con adjunto | Roto: 502 antes de crear la experiencia | El activo intenta apuntar a un padre que aun no existe. |
| Experiencia sin adjuntos | `/api/experiences` | `experiences` + `experience_events` | Funciona segun pruebas previas | El servidor puede ocultar fallos secundarios de eventos/activos. |
| Ubicacion | `/api/integration/ingest` | `context_signals` | Funciona en la prueba reciente | No comparte el camino multimedia. |
| Biometria, actividad y sueno | `/api/integration/ingest` | `context_signals` | Contrato presente; no validado con la build actual de iPhone | La copia local de Vibeapp es 0.4.7+568, no la build 0.5.34+656. |
| Agenda | `/api/integration/ingest` | `agenda_events` | Separada de multimedia | Requiere prueba real posterior, no debe crear experiencia. |
| Reintento de archivo | Cola nativa con misma llave | operacion idempotente | Incompleto | Hoy reintenta un 502 estructural sin separar archivo guardado de vinculo pendiente. |

## Hallazgos de codigo

### A. Orden de operaciones incompatible con la clave foranea

`ExperienceSyncClient.upsertExperience` en
`vibeapp/lib/main.dart` carga cada archivo con `/api/media` antes de crear la
experiencia. El archivo incluye el identificador local de esa experiencia. En el
servidor, `toAssetEvidenceRow` escribe ese identificador como `experience_id`.
La tabla `assets` exige que el padre exista en `experiences`.

El servidor intenta diferir el padre si reconoce el error de clave foranea,
pero la ruta sigue fallando en produccion. La prueba de iPhone demuestra que
esta proteccion no basta para el caso adoptado.

### B. Tres escritores para el mismo vinculo

El vinculo activo-experiencia se escribe desde:

1. `/api/media` -> `upsertAssetEvidence`.
2. `/api/experiences` -> `reconcileDeferredEvidenceForExperiences`.
3. `/api/experiences` -> `syncExperienceAssetsToSupabase`.

El primer escritor incluye reintentos por columnas antiguas. El tercero usa un
`POST` directo a `assets` y no aplica la misma compatibilidad. Si falla, captura
el error y devuelve `asset_sync_failed`, pero `upsertExperience` ignora ese
resultado y responde como si la experiencia estuviera completa.

Esto explica dos sintomas historicos: archivos presentes en Storage sin aparecer
en la Biblioteca, y experiencias creadas con `0 adjuntos`.

### C. Exito de Storage y exito de la historia estan acoplados de forma incorrecta

`saveMediaBuffer` sube bytes a Supabase Storage y registra un intento. Despues,
`/api/media` exige que se cree tambien la fila de `assets`; si esa segunda parte
falla, devuelve 502. La cola nativa lo trata como archivo no enviado y no envía
la experiencia, aunque los bytes puedan estar ya guardados.

La reparacion desde `asset_upload_attempts` existe, pero es reactiva y no evita
el bloqueo inmediato de la experiencia. Tampoco es una garantia: el registro de
intentos ignora sus propios fallos remotos.

### D. Esquema remoto no verificado al inicio

La migracion `database/evidence-adoption-context-signals.sql` agrega
`adoption_status`, `adopted_at` y campos afines. El servidor intenta ser
compatible cuando faltan, pero no verifica el esquema completo antes de aceptar
capturas. El resultado puede ser un 502 tardio y opaco en el telefono.

### E. Pruebas verdes que no cubren el fallo

`npm run check`, `simulate:vibeapp` y `verify:flows` pasan en esta PC. Son
validaciones de sintaxis, presencia de codigo y transportes falsos. La prueba
Flutter simulada asume que `/api/media` devuelve exito y no usa Supabase real.
No hay una prueba de integracion que reproduzca:

`archivo adoptado -> padre inexistente -> persistencia diferida -> crear padre ->
vinculo visible en Biblioteca`.

Ademas, esta PC no tiene Flutter y el codigo Vibeapp disponible declara version
`0.4.7+568`; el iPhone corre `0.5.34+656`. No se puede certificar la build del
telefono a partir de esta copia.

## Causa raiz consolidada

El producto intenta resolver una relacion asincrona (archivo primero, historia
despues) como si fuera una sola transaccion sin cola durable. Al mismo tiempo,
duplica la escritura del mismo registro entre rutas que no tienen las mismas
reglas de compatibilidad ni el mismo manejo de errores.

## Correccion unica propuesta

No aplicar parches por endpoint. Reemplazar los tres escritores por un unico
servicio de persistencia de evidencia con estas reglas:

1. **Recepcion durable de archivo:** `/api/media` confirma el archivo solo cuando
   Storage y un registro minimo de evidencia se hayan guardado. Si viene con un
   padre aun inexistente, se guarda obligatoriamente como `inbox` con
   `pendingExperienceId` en metadata, nunca con `experience_id` directo.
2. **Creacion de historia:** `/api/experiences` crea la experiencia y los eventos
   primero. Luego llama a ese mismo servicio unico para adoptar los archivos cuyo
   `pendingExperienceId` coincide. No ejecuta un segundo `POST` directo a
   `assets`.
3. **Resultado honesto:** una experiencia no responde `completa` si un adjunto no
   quedo vinculado. Debe devolver un estado estructurado: archivo recibido,
   vinculo pendiente o fallo recuperable. Vibeapp traduce eso a texto simple, no
   a JSON ni a codigos HTTP.
4. **Esquema obligatorio:** al iniciar y antes del primer envio multimedia, el
   servidor verifica las columnas y politicas necesarias. Si falta una migracion,
   bloquea la captura con un mensaje claro para operacion y registra la causa; no
   intenta degradar silenciosamente rutas distintas.
5. **Reparacion idempotente:** un proceso de reconciliacion reintenta solamente
   activos `inbox` con `pendingExperienceId` y deja trazabilidad. Nunca duplica
   binarios ni activos.
6. **Lectura unica:** Biblioteca, Bandeja y Activos consultan la misma tabla
   `assets`; la Biblioteca muestra solo `adopted`, la Bandeja solo `inbox`.

## Criterios de cierre obligatorios

No publicar la correccion hasta que una prueba automatizada real o de entorno
controlado cubra todos estos casos con Supabase:

1. Foto, audio, video y documento sueltos llegan una vez a `assets/inbox`.
2. Cada uno dentro de una experiencia abierta llega una vez, crea la experiencia
   y queda `adopted` con su padre y evento correctos.
3. Si el archivo llega antes que el padre, no hay 502; queda pendiente y se
   adopta despues de crear el padre.
4. Si falla Storage, no se crea activo ni experiencia incompleta.
5. Si falla la relacion remota despues de Storage, se muestra `vinculo pendiente`
   y la reconciliacion la completa; no se pierde ni se duplica el archivo.
6. Ubicacion, biometria, agenda y noticias siguen llegando por sus rutas y no
   crean experiencias falsas.
7. VibePWA muestra el mismo estado en Bandeja, Biblioteca y Activos, sin botones
   que cambien la pantalla sin confirmar la accion.

## Acciones siguientes

1. Congelar cambios de interfaz y de exportacion hasta sustituir la persistencia
   multimedia duplicada.
2. Crear prueba de integracion de servidor con Supabase de prueba o un adaptador
   controlado que cubra los siete criterios.
3. Implementar el servicio unico y eliminar las rutas duplicadas.
4. Probar primero con Vibeapp 656 en iPhone y luego con VibePWA en navegador.
5. Solo despues revisar la interfaz para mostrar estados simples y reales.

