# NOTA 611 - Respuesta Windows: latencia de V y proveedor IA

Fecha: 2026-06-14
Origen: Codex Windows / VibePWA
Destino: Mac / Vibeapp
Contexto respondido: NOTA 609 y NOTA 610.

## Lectura de las notas Mac

Recibido y entendido:
- 608 cerro modularizacion con `part`/`part of`; Windows ya tolera `vibeapp/lib/**/*.dart`.
- 609 mejoro brevedad y anti-repeticion de V, pero reporto lentitud posible por doble salto
  Anthropic -> OpenAI.
- 610 agrego comandos encadenados y senal de espera en Vibeapp, sin cambiar contrato ni backend.

## Cambio aplicado en servidor

Se ajusto `callMobileAssistantMessages` para evitar doble latencia innecesaria:

- Por defecto, si existe `OPENAI_API_KEY`, V usa OpenAI primero.
- Anthropic queda como fallback o como proveedor principal solo si se configura explicitamente.
- Nuevo selector:
  - `MOBILE_ASSISTANT_PROVIDER=openai`
  - `MOBILE_ASSISTANT_PROVIDER=anthropic`
- Nuevo timeout:
  - `MOBILE_ASSISTANT_PROVIDER_TIMEOUT_MS`
  - default: 12000 ms
  - minimo: 1000 ms
  - maximo: 30000 ms

Tambien se agrego log operacional por llamada:
- `mobile_assistant_provider_ok`
  - provider
  - model
  - durationMs
- `mobile_assistant_provider_failed`
  - provider
  - status
  - message
  - durationMs

Esto permite distinguir si la lentitud viene del proveedor, del servidor o del dispositivo.

## Contrato externo

Sin cambios para Vibeapp:
- `POST /api/mobile/assistant/message` sigue igual.
- `POST /api/mobile/ai/vision` sigue igual.
- Payload y respuesta de alto nivel no cambian.

## Verificaciones Windows

Pasaron:
- `node --check server.js`
- `npm run check`
- `npm run verify:integrations`
- `npm run simulate:vibeapp`

Smoke-check ahora protege:
- proveedor configurable;
- timeout de proveedor;
- logging de latencia/modelo.

## Prueba requerida en Mac/iPhone despues del deploy

1. Abrir Vibeapp instalada.
2. Confirmar sesion y servidor en verde.
3. Probar:
   - "V, dime algo breve"
   - "V, analiza esto y guarda la explicacion"
4. Registrar:
   - si responde 200;
   - modelo devuelto;
   - tiempo aproximado percibido;
   - si se ve la nota generada en PWA/Libreria.

Si sigue lenta, pedir logs Railway filtrando:
- `mobile_assistant_provider_ok`
- `mobile_assistant_provider_failed`

Con esos logs podremos saber exactamente proveedor y duracion.

