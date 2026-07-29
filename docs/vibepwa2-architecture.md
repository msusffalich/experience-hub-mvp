# VibePWA 2 - arquitectura de producto

Estado: implementacion paralela
Fecha: 2026-07-29
Rama: `codex/vibepwa-2`

## Objetivo

VibePWA 2 reemplaza gradualmente la interfaz monolitica sin modificar la version
productiva durante su validacion. El producto conserva la base de datos, la
autenticacion, los generadores PDF y los contratos verificados del ecosistema.

La nueva aplicacion tiene seis espacios estables:

1. **Inicio:** resumen util, historias recientes y evidencia pendiente.
2. **Historias:** creacion, lectura y edicion de relatos.
3. **Evidencia:** inventario visual de fotos, videos, audios y documentos.
4. **Inteligencia:** reportes, hallazgos y balance por areas de vida.
5. **Publicar:** seleccion editorial de historias y generacion PDF.
6. **Cuenta:** perfil, cuatro idiomas, tema y diagnostico operativo colapsado.

La administracion tecnica no ocupa la navegacion principal. Vive dentro de
`Cuenta > Operacion y diagnostico`.

## Fuente de verdad

- Supabase Auth valida la identidad.
- Supabase Database conserva perfiles, capturas, activos, historias y eventos.
- Supabase Storage privado conserva binarios.
- Railway ejecuta la API y los generadores PDF.
- Obsidian recibe una exportacion derivada; nunca es la fuente de transacciones.

Vibeapp captura hechos. VibePWA organiza historias. Ambas aplicaciones escriben
en la misma cuenta y en los mismos registros del servidor.

## Ruta unica de captura

### Texto y contexto liviano

`Vibeapp/VibePWA -> POST /api/captures -> ledger -> catalogo -> recibo durable`

### Binarios

1. El cliente calcula SHA-256 y conserva el archivo local.
2. `POST /api/captures/uploads` autoriza una ruta privada estable.
3. El cliente envia bytes directamente a Supabase Storage.
4. Hasta 6 MiB usa `PUT` firmado.
5. Por encima de 6 MiB o con red inestable usa TUS reanudable en bloques de
   6 MiB.
6. `POST /api/captures/commit` verifica tamano y MIME.
7. Solo despues crea o confirma el catalogo.
8. El servidor responde `complete` cuando archivo y registro son durables.

Una respuesta parcial nunca se presenta como exito. Repetir la misma captura
con la misma clave no crea duplicados. Reusar la clave para otro contenido se
rechaza.

## Estados operativos

| Estado | Significado |
| --- | --- |
| `received` | Operacion registrada |
| `storing` | Esperando o recibiendo el binario |
| `binary_stored` | Binario verificado |
| `cataloging` | Creando el registro visible |
| `complete` | Archivo y catalogo confirmados |
| `retry_pending` | Puede reintentarse con la misma clave |
| `needs_attention` | Conflicto o integridad incorrecta |

## Trabajo sin conexion

El movil mantiene el archivo, sus metadatos, checksum e idempotency key. Cuando
recupera conectividad:

1. solicita o renueva autorizacion;
2. reanuda el archivo;
3. confirma el commit;
4. elimina la copia local solo tras recibir `complete`.

La hora de la vivencia es `occurredAt`, no la hora de sincronizacion.

## Limites de responsabilidad

- Guardar una captura no ejecuta IA, clima, noticias ni PDFs.
- Enriquecimientos son trabajos posteriores observables y reintentables.
- Una evidencia sin historia permanece en bandeja.
- Una historia adopta evidencia por seleccion humana o ventana temporal.
- Reportes y hallazgos pueden leer hechos, areas y contexto aunque no exista
  una historia.
- Publicaciones pueden combinar historias y evidencia.

## Compatibilidad temporal

La ruta multipart anterior permanece disponible durante el canario. No es la
ruta objetivo y no se amplian sus responsabilidades. Se retira solamente
despues de comprobar iPhone, iPad, Android/emulador, navegadores y recuperacion
offline sobre el contrato nuevo.

## Puertas de salida

La nueva version no sustituye produccion hasta cumplir:

- matriz de activos completa;
- reintentos sin duplicados;
- archivo grande reanudable;
- cierre offline;
- UI visual en movil, tableta y escritorio;
- cuatro idiomas completos;
- PDFs existentes sin regresion;
- telemetria sin secretos;
- rollback documentado.

La guía detallada por tipo de activo, estados, reintentos y despliegue está en
`docs/vibepwa2-operational-flows.md`.
