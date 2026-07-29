# Handcheck VibePWA 728 - Contrato y acceso canario

Fecha: 2026-07-28
Version: `20260728-capture-canary-contract-728`
Responsable: Codex PC

## Objetivo

Preparar el servidor para que una build nueva de Vibeapp pueda migrar a la ruta
unica de capturas de forma reversible, por un solo usuario y sin alterar V1.

## Implementado

1. `CAPTURE_PIPELINE_MODE` acepta solamente `off`, `canary` u `on`.
2. Un modo no reconocido se degrada a `off`.
3. `CAPTURE_PIPELINE_CANARY_USERS` acepta ids o correos separados por coma.
4. El servidor valida el usuario autenticado antes de aceptar una captura.
5. `GET /api/captures/status` publica:
   - modo;
   - habilitacion del usuario;
   - preparacion de infraestructura;
   - motivo;
   - contrato movil completo;
   - observacion de compatibilidad de V1.
6. `POST /api/captures` mantiene una captura por solicitud.
7. `GET /api/captures/operations/{operationId}` permite reconciliar respuestas
   perdidas sin duplicar.
8. `occurredAt` es obligatorio: una captura offline conserva su fecha real.
9. La clave de idempotencia debe coincidir entre cabecera y cuerpo.
10. Los campos de historia o evento siguen prohibidos.

## Garantias

- La configuracion por defecto sigue siendo `off`.
- V1 no cambia de ruta.
- La 728 no activa variables en Railway.
- No se migran ni borran datos.
- No se crea ninguna experiencia o evento desde la ruta de captura.
- Un usuario fuera del canario recibe `capture_pipeline_canary_only`.
- Un canario sin infraestructura Supabase completa no puede escribir.
- El canario se apaga cambiando una variable; no requiere reinstalar Vibeapp.

## Contrato

Documento:

`docs/capture-api-contract-20260728.md`

Handcheck para Mac:

`HANDCHECK_CODEX_PC_A_VIBEAPP_728_CONTRATO_CANARIO.md`

## Fuente movil

La ultima fuente declarada como instalada es `Vibeapp 0.5.34+663`. La copia
Windows `0.4.7+568` es obsoleta y no se usara para modificar el cliente.

## Verificacion

`npm run verify:release`: verde.

Incluye:

- contrato de captura;
- todos los tipos;
- idempotencia y reintento;
- fecha original obligatoria;
- modo apagado;
- canario autorizado y bloqueado;
- aislamiento de historias;
- observador 727;
- sincronizacion y automatizaciones;
- Obsidian;
- reportes, hallazgos, publicaciones y manual PDF;
- E2E funcional;
- PWA.

## Lo que falta antes del GO

1. Claude Mac implementa el cliente contra la fuente 663 o posterior.
2. Codex verifica `database/capture-pipeline.sql` mediante el estado del
   servidor.
3. Se configura un solo usuario en Railway.
4. Se ejecuta la matriz real por tipo, incluyendo offline, reinicio, timeout y
   respuesta perdida.
5. Solo con equivalencia completa se retiran las rutas anteriores.
