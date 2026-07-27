# Guía de la arquitectura V2 y flujo operacional por tipo de activo

> **Documento histórico, no vigente.** La ruta V2 fue congelada después de una
> falla real. La guía canónica es
> `docs/guia-arquitectura-y-flujos-por-activo-20260727.md`.

Fecha: 2026-07-26  
Estado: guía de implementación paralela; se actualizará tras el canario real

## 1. Propósito

La arquitectura V2 separa tres acciones que antes podían confundirse:

1. **Capturar:** conservar un hecho o archivo sin exigir que la historia exista.
2. **Estructurar:** crear la experiencia y sus eventos.
3. **Enriquecer:** relacionar contexto, analizar activos y producir reportes.

Vibeapp prioriza la captura móvil. VibePWA prioriza la estructuración, revisión y
explotación. Ambas usan el mismo servidor y la misma identidad de datos.

## 2. Fuentes de verdad

| Información | Fuente canónica |
| --- | --- |
| Archivo o evidencia intencional | `assets` + Storage privado |
| Estado de una carga/reintento | `evidence_operations_v2` |
| Historia | `experiences` |
| Submomento narrativo | `experience_events` |
| Ubicación, biometría, clima y otras señales | `context_signals` |
| Conocimiento curado | Bóveda Obsidian, derivada del servidor |

`experiences.attachments` queda como compatibilidad V1 durante la migración. No
es fuente canónica de V2.

## 3. Recorrido común de una evidencia

1. Vibeapp crea identificadores estables y guarda localmente.
2. Envía a `POST /api/v2/evidence`.
3. El servidor reserva la clave idempotente en una transacción.
4. Guarda el contenido en el bucket privado V2.
5. Verifica que el objeto exista.
6. Registra una sola fila en `assets`, inicialmente en Bandeja.
7. Si no hay historia, termina como `inbox_complete`.
8. Si se pidió una historia futura, queda `link_pending`.
9. Al guardar la historia, una función transaccional:
   - actualiza eventos sin borrarlos;
   - vincula todos los activos;
   - comprueba que el número esperado coincide con el vinculado.
10. Biblioteca, Bandeja y Activos leen la misma fila y muestran vistas distintas.

## 4. Trabajo sin señal

- La captura queda en una cola durable del teléfono.
- El usuario puede cerrar y abrir la app.
- `capturedAt` conserva el momento real.
- `uploadedAt` registra cuándo llegó al servidor.
- La historia y los archivos pueden llegar en cualquier orden.
- Una repetición idéntica continúa la misma operación.
- Un contenido distinto con la misma clave se detiene para revisión.

## 5. Flujo por tipo

### 5.1 Texto humano

**Uso:** nota escrita sobre lo vivido.

**Captura:** JSON con texto y hora original.  
**Persistencia:** archivo privado `text/plain` + fila `assets`.  
**Narrativa:** puede alimentar el relato cuando el usuario la adopta.  
**No confundir con:** OCR, nombre de archivo o texto generado por IA.

### 5.2 Foto

**Uso:** evidencia visual intencional.

**Captura:** multipart con JPEG, HEIC u otro formato admitido.  
**Persistencia:** original privado; miniatura es derivada, no reemplaza el original.  
**Adopción:** experiencia o evento.  
**Procesamiento posterior:** orientación, miniatura y visión IA.  
**Narrativa:** la descripción automática es contexto, no voz humana.

### 5.3 Audio

**Uso:** nota de voz o ambiente grabado.

**Captura:** archivo original.  
**Procesamiento posterior:** transcripción separada.  
**Narrativa:** es humana si la voz cuenta lo vivido; ruido o ambiente es evidencia.  
**Adopción:** experiencia o evento según su alcance.

### 5.4 Video

**Uso:** escena con o sin relato.

**Captura:** MP4, MOV/HEVC u otro formato admitido.  
**Persistencia:** original privado; no se carga completo en memoria cuando se
habilite la ruta reanudable para archivos grandes.  
**Procesamiento posterior:** miniatura, metadatos y transcripción de voz.  
**Narrativa:** solo la voz humana transcrita; las imágenes son evidencia.

### 5.5 Documento

**Uso:** PDF, informe, examen, entrada, recibo o referencia.

**Captura:** archivo original.  
**Procesamiento posterior:** OCR e interpretación en lenguaje claro.  
**Clasificación:** normalmente artefacto o referencia; puede apoyar una
experiencia, pero no se vuelve experiencia por sí solo.

### 5.6 Ubicación

**Uso:** contexto temporal y geográfico.

**Entrada:** `/api/integration/ingest`.  
**Destino:** `context_signals`.  
**Comportamiento:** se referencia por tiempo; no aparece como archivo pendiente
ni crea una experiencia.

### 5.7 Biometría, actividad y sueño

**Uso:** contexto medido desde HealthKit, Health Connect, Oura o dispositivos.

**Entrada:** `/api/integration/ingest`.  
**Destino:** `context_signals`.  
**Comportamiento:** conserva métricas disponibles; un dato ausente no se
convierte en cero. Se relaciona por persona y ventana temporal.

### 5.8 Clima y entorno

**Uso:** explicar condiciones del lugar y momento.

**Origen normal:** Vibeapp aporta ubicación y contexto móvil; el servidor
enriquece y conserva el resultado.  
**Destino:** contexto/briefing, no `assets`.  
**Comportamiento:** automático y no bloquea la captura principal.

### 5.9 Noticias y entretenimiento

**Uso:** contexto externo vigente.

**Origen:** fuentes confiables, fecha y ciudad del usuario.  
**Destino:** contexto diario.  
**Comportamiento:** no se adopta como evidencia personal salvo que el usuario
guarde explícitamente una publicación o documento como referencia.

### 5.10 Agenda

**Uso:** plan o compromiso.

**Entrada:** `/api/integration/ingest`.  
**Destino:** `agenda_events`.  
**Comportamiento:** no crea experiencia automáticamente. Después del evento, el
usuario puede construir una experiencia y relacionarla por tiempo.

### 5.11 Meta glasses

**Uso:** fotos, videos y voz capturados con lentes.

**Ruta práctica:** lentes -> app Meta -> Fotos/Galería del teléfono -> Vibeapp.  
**Formatos:** imagen y video normales; el reporte HTML/JSON de Meta es una
fuente estructurada distinta.  
**Autocapture:** el material importado sigue el flujo de foto/video; la
compilación de Meta puede conservarse como video adicional.  
**Privacidad:** el usuario elige qué importar; Vibe no asume acceso directo a
todo el contenido de la cuenta Meta.

## 6. Qué ve el usuario

Vibeapp muestra:

- Enviando.
- Guardado; esperando historia.
- Vinculando con la historia.
- Listo.
- Se reintentará automáticamente.
- Requiere revisión.

VibePWA muestra:

- Bandeja: evidencias intencionales todavía sin historia.
- Biblioteca: experiencias y eventos.
- Activos: inventario completo y estado real.
- Contexto: señales ambientales y biométricas, fuera de la Bandeja.

## 7. Fallos y recuperación

| Falla | Resultado |
| --- | --- |
| Sin red | permanece en cola local |
| Storage no guarda | no se registra activo falso |
| Storage guarda y tabla falla | se reintenta la fila sin duplicar binario |
| Padre no existe | queda pendiente, no devuelve 502 estructural |
| Evento no existe aún | archivo guardado; espera actualización |
| Respuesta se pierde | reintento recupera la misma operación |
| Misma clave, contenido distinto | conflicto visible a Operación |
| Asociación incompleta | la historia no se declara completa |

## 8. Despliegue seguro

1. V2 permanece `off`.
2. Se aplica la migración aditiva.
3. `/api/v2/status` debe indicar todos los controles preparados.
4. Se despliega código sin desviar V1.
5. Se activa `canary` solo para Miguel.
6. Vibeapp canaria usa rutas V2.
7. Se prueban todos los tipos, sin señal y reintentos.
8. Se valida consistencia en las tres vistas.
9. Solo entonces se activa `on`.
10. V1 se retira en un release separado.

## 9. Regla de cierre

Ninguna pantalla, log o prueba sintética sustituye la verificación del estado
persistido. Una operación termina únicamente cuando contenido, fila, padre y
vista coinciden.
