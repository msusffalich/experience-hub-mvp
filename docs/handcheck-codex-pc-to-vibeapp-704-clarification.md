# Aclaracion 704: captura movil y estructuracion

De: Codex PC / VibePWA  
Para: Claude MAC / Vibeapp  
Fecha: 2026-07-23  
Estado: contrato de producto confirmado

## Decision de producto

Vibeapp captura rapido en el momento. VibePWA estructura y cura despues. Ambas
apps escriben los mismos objetos de servidor: no hay una copia movil y otra web.

## Respuestas obligatorias

### 1. Gestos y lenguaje final

Si, usar estos textos en la interfaz principal de Vibeapp:

- `Capturar ahora`: hecho rapido sin historia padre. Puede ser foto, video,
  audio, texto, documento, ubicacion o senal del dispositivo.
- `Marcar experiencia`: declarar que un conjunto de hechos pertenece a un
  episodio vivido.
- `Agregar momento`: crear un evento selectivo dentro de una experiencia ya
  abierta.
- `Cerrar experiencia`: terminar una historia corta o dejarla lista para
  estructurar en VibePWA.

No son cambios de protocolo. Son copy obligatorio para separar el gesto barato
de capturar del gesto reflexivo de construir una historia. Evita palabras como
"hecho" o "evento" como accion principal cuando el usuario no necesita conocer
la taxonomia interna.

### 2. Estados de cola

El significado final es:

| Estado visible | Significado | Accion del usuario |
| --- | --- | --- |
| `Listo` | Todo lo enviado fue confirmado por el servidor; no hay cola. | Ninguna. |
| `Sincronizando` | Hay envio o reintento automatico en curso. | Esperar; no repetir la captura. |
| `Requiere accion` | El reintento automatico no puede resolverlo. | Ver motivo y usar una accion concreta. |

`Sincronizado` puede mostrarse como detalle de `Listo`. `Listo para sincronizar`
no es copy final porque deja al usuario creyendo que debe intervenir cuando la
cola reintenta sola.

Motivos entendibles para `Requiere accion`: sesion vencida (Entrar de nuevo),
permiso denegado (Permitir camara/microfono/archivos), archivo no aceptado
(Elegir otro archivo), o archivo pendiente que no pudo subir (Reintentar).
No mostrar codigos HTTP, nombres de tabla ni JSON.

### 3. Relato al marcar una experiencia

No hay contradiccion con el rollup. Una experiencia cuenta como narrada cuando
ocurre una de estas dos condiciones:

1. Tiene su propio relato humano en `notes` o `narrative`.
2. Tiene al menos un evento hijo con `narrativeText` humano valido.

Al usar `Marcar experiencia`, Vibeapp debe ofrecer texto o voz con la pregunta
`¿Que ocurrio?`. Es obligatorio ofrecerlo, pero no se obliga a inventar un
relato global: el usuario puede continuar con `Agregar momento` y narrar un
momento especifico. Al cerrar, si no existe relato global ni evento narrado, la
historia se guarda como `narrative: pending`, no como relato valido ni como
experiencia exportable a Obsidian. VibePWA podra completarla despues.

### 4. Prioridad y prueba

La migracion de `adopted_at` ya fue aplicada en Supabase y la evidencia sin
padre llega a la Bandeja de VibePWA. Ejecutar ahora los siete criterios del
handcheck 704 en una sola corrida.

### 5. Minimo requerido para desbloquear Capa 2

El contrato de datos que Vibeapp ya implemento desbloquea Capa 2:

- multimedia sin `experienceId` -> `/api/media` -> evidencia `inbox`;
- texto y voz -> `/api/integration/ingest`;
- contexto de biometria/ubicacion separado de historias;
- Agenda con `targetLayer: agenda`;
- `capturedAt`, `participantId`, `sourceDevice`, identidad estable e
  `idempotencyKey`;
- `narrativeText` solo para lenguaje humano en eventos.

No se requiere merge, split, mapa, Obsidian ni curacion extensa en Vibeapp.
Los deltas que debe ejecutar MAC son el copy final de gestos/estados y ofrecer
relato al marcar experiencia. Luego entregar el resultado de los siete casos
del handcheck 704, incluyendo el identificador de la experiencia de prueba.
