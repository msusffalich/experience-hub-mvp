# Guía de arquitectura y flujo operacional por tipo de activo

Fecha: 2026-07-27
Estado: referencia canónica de implementación y operación

## 1. La regla que simplifica el sistema

Vibeapp captura. VibePWA crea historias.

Una foto, una nota o una medición puede existir y aportar valor sin pertenecer a
una historia. Reportes, hallazgos y publicaciones pueden utilizarla según el
alcance elegido. El mapa y Obsidian solo utilizan historias confirmadas.

## 2. Recorrido común

1. **Captura local:** Vibeapp guarda el original con persona y hora.
2. **Cola durable:** cerrar la app o perder señal no elimina el elemento.
3. **Recepción:** `POST /api/captures` recibe una intención explícita.
4. **Almacenamiento:** los archivos van a Storage privado.
5. **Catálogo:** texto, archivo o contexto queda registrado en `capture_records`.
6. **Recibo:** la operación queda `complete` solo tras verificar ambos pasos.
7. **Uso posterior:** VibePWA muestra evidencia, crea historias o genera salidas.

## 3. Matriz por tipo

| Tipo | Intención | Se guarda | Vista normal | Puede narrar | Uso sin historia |
|---|---|---|---|---|---|
| Texto | evidencia | texto + metadatos | extracto legible | sí, si relata lo vivido | sí |
| Imagen | evidencia | original + miniatura derivada | miniatura | no por sí sola | sí |
| Audio | evidencia | original + transcripción derivada | reproductor + extracto | sí, si contiene relato | sí |
| Video | evidencia | original + fotograma + transcripción | fotograma + duración | sí, por voz humana | sí |
| Documento | evidencia | original + OCR/interpretación | portada/extracto | solo la reflexión humana | sí |
| Biometría | contexto | métricas disponibles | valores directos y tendencia | no | sí |
| Ubicación | contexto | coordenada, lugar y hora | nombre de lugar/mapa | no | sí |
| Clima | contexto | mediciones y fuente | resumen de condiciones | no | sí |
| Noticias | contexto | titular, fecha, fuente y ciudad | resumen vigente | no | sí |
| Agenda | contexto | compromiso programado | agenda | no; aún no ocurrió | sí |

## 4. Detalle operacional

### Texto

- Se envía como JSON.
- Requiere contenido real; un placeholder no es captura.
- Se muestra como extracto, no como nombre de archivo.
- Puede convertirse en narrativa cuando el usuario construye una historia.

### Imagen

- Se envía como multipart o carga reanudable.
- Se conserva orientación y metadatos originales.
- VibePWA muestra miniatura grande y fecha.
- Visión IA ayuda a buscar, pero no reemplaza el relato humano.

### Audio

- Se conserva el archivo original.
- La transcripción ocurre después de guardar.
- Si falla la transcripción, el audio sigue disponible.
- VibePWA permite escuchar antes de seleccionarlo.

### Video

- Se conserva el original MP4/MOV/HEVC.
- La interfaz usa fotograma, duración y transcripción, no el nombre técnico.
- Un video sin voz es evidencia visual.
- Un video narrado aporta narrativa por su voz transcrita.

### Documento

- Se conserva PDF, Word, texto u otro formato permitido.
- OCR e interpretación son procesos derivados.
- Un examen médico puede generar un resumen claro, sin alterar el original.
- Un informe es artefacto; la experiencia de producirlo requiere relato aparte.

### Biometría

- Salud, actividad y sueño se guardan como contexto.
- Se muestran pasos, frecuencia cardíaca, HRV, sueño, SpO2 u otros datos presentes.
- No haber lectura de sueño no equivale a dormir cero.
- La energía estimada se oculta si la cobertura no es suficiente.

### Ubicación, clima y noticias

- Se relacionan por persona y hora.
- No crean historias.
- Las fuentes deben incluir fecha y procedencia.
- Un proveedor lento no bloquea guardar la captura principal.

### Agenda

- Describe un compromiso futuro o planificado.
- No se convierte en experiencia al guardarse.
- Después del momento, VibePWA puede proponer evidencia temporalmente cercana.

### Meta Ray-Ban y Oakley

- Fotos y videos se importan mediante Meta AI hacia Fotos/Galería y luego Vibeapp.
- JPEG/HEIC y MP4/HEVC siguen los flujos normales de imagen y video.
- El HTML/JSON de Meta es una exportación de cuenta, no el transporte principal de multimedia.
- Autocapture puede aportar clips y compilaciones; cada archivo mantiene origen Meta.
- La voz de V y el wake-up permanecen en teléfono o tableta según las reglas del sistema operativo.

## 5. Trabajo sin señal

1. Vibeapp cifra y conserva la captura local.
2. El estado visible es “Se enviará cuando vuelva la conexión”.
3. Cada reintento conserva `captureId`, `idempotencyKey` y checksum.
4. Si el archivo ya llegó y falló el catálogo, el siguiente intento no duplica bytes.
5. Tras demasiados fallos, pasa a “Requiere atención”; no desaparece.
6. El usuario puede reintentar sin crear una segunda captura.

## 6. Construcción visual de una historia

VibePWA muestra:

- franja temporal;
- persona/grupo;
- miniaturas;
- reproductores;
- fotogramas de video;
- extractos de texto y documentos;
- contexto resumido del período.

El usuario:

1. selecciona evidencia;
2. escribe o dicta qué vivió;
3. ordena el material;
4. agrega eventos solo si aportan significado;
5. confirma la historia.

Los identificadores técnicos permanecen ocultos en Operación.

## 7. Selección para salidas

Reportes, Hallazgos y Publicaciones comparten:

- período;
- persona/grupo;
- base: todo, historias o evidencia;
- filtros opcionales de categoría, lugar, tipo y texto.

Publicaciones añade una aprobación visual final. El usuario ve una frase resumen
del alcance antes de ejecutar.

### Cómo interpreta cada salida la misma selección

| Salida | Papel de experiencias y eventos | Papel de evidencia y contexto |
|---|---|---|
| Reporte | Son registros confirmados que aportan fecha, actividad, duración, participantes y otros hechos | Aporta archivos, mediciones y condiciones observables; no se transforma en relato |
| Hallazgos | Aportan observaciones comparables para detectar patrones | Aporta soporte, cobertura y contraste; toda inferencia conserva su nivel de confianza |
| Publicación | Sus narrativas humanas forman el hilo editorial y cronológico | Imágenes, videos, audios, documentos y mediciones ilustran y respaldan la historia |

`Todo` no significa lo mismo en la redacción final: en Reportes y Hallazgos es
una base factual combinada; en Publicaciones es una historia compuesta con
narrativas confirmadas y multimedia seleccionada. Si una publicación usa solo
evidencia, Vibe produce un dossier cronológico y declara que todavía no existe
una historia humana confirmada.

## 8. Fallos y respuesta

| Falla | Respuesta del sistema |
|---|---|
| Sin red | conserva en cola y reintenta |
| Storage falla | no declara guardado |
| Storage guarda y catálogo falla | reanuda sin duplicar |
| Respuesta se pierde | consulta el mismo recibo |
| Misma clave, otro contenido | requiere atención |
| Procesamiento derivado falla | original disponible; job reintentable |
| Filtro sin resultados | explica qué alcance no encontró datos |
| Proveedor externo cae | captura y datos existentes siguen operativos |

## 9. Criterio de cierre

Un flujo está terminado cuando el original, el catálogo, el recibo y la vista del
usuario coinciden. Un test sintético ayuda, pero no sustituye la prueba real del
tipo de activo y escenario que declara cubrir.
