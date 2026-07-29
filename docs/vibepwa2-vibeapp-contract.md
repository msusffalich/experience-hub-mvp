# Contrato Vibeapp -> servidor para VibePWA 2

## Regla

Vibeapp envia capturas, no historias obligatorias.

Cada envio conserva:

- `captureId` estable;
- `idempotencyKey` estable durante todos los reintentos;
- `intent`: `evidence` o `context`;
- `kind`;
- `occurredAt`;
- persona/grupo cuando corresponda;
- origen y dispositivo;
- SHA-256, nombre, MIME y tamano para binarios.

No se envian `experienceId`, `eventId`, titulo de historia ni categoria como
requisitos de captura. Si el usuario pronuncia o escribe un relato, ese texto
sigue siendo evidencia narrativa humana y puede adoptarse despues.

## Activos

| Tipo | Intent | Transporte |
| --- | --- | --- |
| Texto/voz transcrita | evidence | `POST /api/captures` JSON |
| Foto | evidence | autorizacion, carga directa, commit |
| Audio | evidence | autorizacion, carga directa, commit |
| Video | evidence | autorizacion, TUS cuando corresponda, commit |
| Documento | evidence | autorizacion, carga directa, commit |
| Biometria | context | JSON si es muestra; directo si es archivo |
| Ubicacion | context | `POST /api/captures` JSON |
| Clima/noticia/agenda | context | `POST /api/captures` JSON |

## Recibo

El movil solo marca sincronizado cuando recibe:

```json
{
  "ok": true,
  "durable": true,
  "state": "complete",
  "operationId": "...",
  "captureId": "..."
}
```

`retry_pending` conserva el item local. `needs_attention` lo conserva y muestra
una explicacion comprensible. Un timeout nunca elimina el archivo.

## Compatibilidad

La implementacion nativa puede mantener temporalmente la ruta multipart, pero
el nuevo cliente debe preferir el contrato directo cuando
`/api/captures/status` publique `directUpload`.
