# VibePWA 2 y Backend 2 - migración, promoción y rollback

Estado: runbook operativo

Objetivo: migrar sin pérdida de datos, sin cortar producción y sin falso verde.

## 1. Regla de migración

VibePWA 2 y Backend 2 se validan en paralelo. La interfaz o ruta anterior no se
retira hasta que el contrato `/api/v2` complete todas las puertas de salida.

No se ejecutan cambios destructivos durante la migración. Las tablas y rutas
nuevas se agregan, se verifican y luego se promueven.

## 2. Inventario previo

Antes de modificar Supabase o Railway:

- registrar commit y versión desplegada;
- exportar el esquema actual;
- confirmar respaldo de Database y Storage;
- contar usuarios, grupos, historias, eventos y activos;
- registrar bucket y políticas vigentes;
- identificar clientes que aún usan rutas anteriores;
- comprobar que existe una ventana de rollback.

## 3. Variables de Backend 2

### Obligatorias

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` o `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` o `SUPABASE_SECRET_KEY`
- `SUPABASE_STORAGE_BUCKET`

### Operativas

- `VIBE_API_V2_PORT` o `PORT`
- `VIBE_API_V2_MAX_JSON_BYTES`
- `VIBE_API_V2_MAX_FILE_BYTES`
- `VIBE_API_V2_UPSTREAM_TIMEOUT_MS`
- `VIBE_API_V2_HEALTH_CACHE_MS`
- `VIBE_API_V2_PUBLIC_BASE_URL`
- `PYTHON_COMMAND`
- `OBSIDIAN_VAULT_PATH`
- `OPENAI_API_KEY`
- `VIBE_ASSISTANT_MODEL`

### Oura

- `OURA_CLIENT_ID`
- `OURA_CLIENT_SECRET`
- `OURA_REDIRECT_URI`
- `OURA_WEBHOOK_SECRET`
- `INTEGRATION_ENCRYPTION_KEY`

No se copian secretos en documentación, logs, navegador o aplicación móvil.

## 4. Migración SQL

Aplicar en el proyecto Supabase correcto:

1. `database/capture-pipeline.sql`
2. `database/evidence-adoption-context-signals.sql`, si aún no está aplicado
3. `database/vibe-api-v2.sql`

### Validación

- Revisar el resultado de los `SELECT` de verificación.
- Confirmar tablas, índices, funciones y políticas RLS.
- Probar que un usuario no puede leer ni modificar registros de otro.
- Confirmar `energy` nullable.
- Confirmar transacciones `save_story_v2` y `delete_story_v2`.
- Confirmar tablas de trabajos e integraciones.

Un mensaje “Success” del editor SQL no basta. La verificación debe leer los
objetos creados y ejecutar una transacción de prueba.

## 5. Storage

1. Confirmar que el bucket configurado existe y es privado.
2. Verificar políticas de subida y descarga.
3. Ejecutar una prueba de escritura, lectura y eliminación con la clave de
   servicio.
4. Ejecutar una carga firmada con sesión de usuario.
5. Ejecutar una carga reanudable.
6. Confirmar que la ruta queda bajo el propietario correcto.

Una respuesta 404, 400 o un archivo sin catálogo bloquea la promoción.

## 6. Despliegue paralelo

1. Desplegar el código con `/api/v2` sin cambiar todavía el acceso principal.
2. Mantener VibePWA 2 en su ruta paralela.
3. Verificar `GET /api/v2/health/live`.
4. Verificar `GET /api/v2/health/ready?force=true`.
5. Iniciar sesión con el usuario canario.
6. Ejecutar la salud autenticada y el roundtrip de captura.

### Evitar falso verde

Railway puede marcar el contenedor verde con liveness. Eso solo demuestra que
Node responde. La promoción exige:

- `ready: true`;
- Database legible y escribible;
- Storage con roundtrip real;
- autenticación válida;
- una captura completa visible en VibePWA 2.

Si cualquiera falla, el estado operativo es `degraded`, aunque Railway esté
verde.

## 7. Canario

Usar primero una sola cuenta autorizada.

### Matriz mínima

| Caso | Validación |
| --- | --- |
| Texto | Una captura, una fila, sin duplicado |
| Imagen | Storage + catálogo + miniatura |
| Audio | Archivo reproducible |
| Video grande | Pausa, reanudación y commit |
| Documento | Descarga privada temporal |
| Biometría | Valores reales; ausentes omitidos |
| Ubicación | Contexto con hora y precisión |
| Clima | Contexto sin crear historia |
| Noticias | Fuente y fecha visibles |
| Agenda | No crea experiencia |
| Offline | Conserva hora original |
| Grupo/persona | Aislamiento y filtro correctos |

### Historias

- crear una historia sin evidencia;
- adoptar varias capturas;
- crear eventos;
- editar;
- retirar evidencia;
- dividir o unir;
- eliminar y comprobar que los archivos regresan a la bandeja;
- forzar un fallo intermedio y comprobar que no queda escritura parcial.

### Salidas

- reporte por período, persona y área;
- hallazgo con nivel de confianza;
- publicación con historias y activos;
- paquete con video;
- exportación Obsidian consistente.

## 8. Integraciones

### Oura

- probar OAuth completo;
- confirmar cifrado del token;
- sincronizar una colección con datos y otra vacía;
- validar webhook correcto;
- rechazar firma inválida;
- confirmar trabajo, reintento y error final visibles.

### Móvil

- HealthKit en iPhone/iPad;
- Health Connect en Android o emulador;
- reintento con aplicación cerrada y reapertura;
- archivo capturado sin red y sincronizado horas después.

La falta de dispositivo real se registra como limitación explícita. No se
declara validado por una prueba sintética.

## 9. Cuatro idiomas y UI

Revisar ES, EN, FR y PT en:

- login;
- Inicio;
- Historias;
- Evidencia;
- Inteligencia;
- Publicar;
- Cuenta;
- confirmaciones y errores;
- operación y ayuda.

Revisar escritorio, tableta y móvil. No puede haber texto desbordado, botones
sin confirmación ni identificadores técnicos como descripción principal.

## 10. Promoción

Promover únicamente cuando:

- la matriz está completa;
- no existen errores críticos o altos abiertos;
- los conteos coinciden con Supabase;
- no hay trabajos perdidos;
- los PDF son válidos;
- el usuario canario terminó los flujos cotidianos;
- el rollback fue ensayado.

Entonces:

1. registrar versión aprobada;
2. cambiar el acceso principal a VibePWA 2;
3. mantener la versión anterior disponible durante la ventana acordada;
4. observar errores, latencia y colas;
5. ampliar usuarios gradualmente.

## 11. Rollback

El rollback:

- restaura la interfaz anterior;
- desactiva el enrutamiento de clientes nuevos;
- no revierte ni elimina capturas completas;
- conserva ledger, catálogo y archivos;
- pausa trabajos incompatibles;
- registra causa, alcance y versión.

No usar `git reset --hard`, borrar tablas ni limpiar Storage para revertir una
interfaz.

## 12. Limpieza posterior

Las rutas anteriores se retiran solo cuando:

- todos los clientes activos usan `/api/v2`;
- la ventana de rollback terminó;
- no hay tráfico en endpoints antiguos;
- la documentación y manuales apuntan a V2;
- el código muerto fue identificado y eliminado en un cambio separado.

## 13. Evidencia de cierre

El paquete de liberación conserva:

- commit y versión;
- resultado de pruebas;
- matriz de activos;
- captura de readiness;
- conteos antes y después;
- prueba offline;
- prueba de aislamiento entre usuarios;
- prueba de rollback;
- limitaciones restantes, si existieran.

No se declara “100 %” mientras exista una limitación sin validar o un error
pendiente.
