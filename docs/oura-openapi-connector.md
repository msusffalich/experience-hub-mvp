# Conector Oura OpenAPI v2

Version app: `20260528-oura-openapi-connector-485`

## Decision

El archivo `openapi-1.30.json` sirve para Vibe como base de un conector biometrico real de Oura. No sirve para multimedia; su valor esta en sueño, actividad, recuperacion, estres, resiliencia, SpO2, frecuencia cardiaca, entrenamientos, edad cardiovascular, VO2 max y bateria del anillo.

## Rutas backend incorporadas

- `GET /api/integration/oura/manifest`: describe endpoints Oura, scopes, tipos de datos, metricas y modo recomendado de sincronizacion.
- `POST /api/integration/oura/normalize`: recibe uno o varios documentos Oura y los transforma en señales Vibe compatibles con `vibe-signal-contract-v2`.

## Mapeo principal

| Oura data type | Endpoint Oura | Vibe payload | Uso en Vibe |
|---|---|---|---|
| `daily_readiness` | `/v2/usercollection/daily_readiness` | `biometric` | energia, recuperacion, temperatura |
| `daily_sleep` / `sleep` | `/v2/usercollection/daily_sleep`, `/v2/usercollection/sleep` | `sleep` | sueño, descanso, recuperacion |
| `daily_activity` | `/v2/usercollection/daily_activity` | `activity` | pasos, calorias, movimiento |
| `daily_stress` | `/v2/usercollection/daily_stress` | `biometric` | estres y recuperacion |
| `daily_resilience` | `/v2/usercollection/daily_resilience` | `biometric` | resiliencia |
| `daily_spo2` | `/v2/usercollection/daily_spo2` | `biometric` | oxigenacion y respiracion |
| `heartrate` | `/v2/usercollection/heartrate` | `biometric` | frecuencia cardiaca |
| `workout` | `/v2/usercollection/workout` | `activity` | ejercicio |
| `daily_cardiovascular_age` | `/v2/usercollection/daily_cardiovascular_age` | `biometric` | edad cardiovascular |
| `vO2_max` | `/v2/usercollection/vO2_max` | `biometric` | capacidad aerobica |
| `ring_battery_level` | `/v2/usercollection/ring_battery_level` | `context` | salud del dispositivo |

## Seguridad y privacidad

- Los datos Oura se tratan como `privacyLevel: sensitive`.
- OAuth/token debe vivir en backend, nunca en el navegador.
- La URL base normalizada debe ser `https://api.ouraring.com`; el OpenAPI recibido trae `https://api.None.com`, por lo que no se usa literalmente.
- La sincronizacion productiva requiere `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET` y `OURA_REDIRECT_URI`.

## Siguiente incremento

1. Agregar pantalla de conexion Oura en Administracion.
2. Implementar OAuth backend.
3. Guardar token cifrado o delegado a Supabase secrets/Edge Function.
4. Crear job diario para `daily_readiness`, `daily_sleep`, `daily_activity`, `daily_stress` y `daily_resilience`.
5. Usar webhooks despues de la primera sincronizacion estable.
