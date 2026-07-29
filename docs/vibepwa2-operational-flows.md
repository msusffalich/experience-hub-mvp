# VibePWA 2 - arquitectura y flujos operativos

Estado: listo para validación canaria
Fecha: 2026-07-29
Documento canónico de implementación: `docs/vibepwa2-architecture.md`

## 1. Propósito

Vibe conserva hechos multimodales y permite darles sentido después. El sistema
separa dos trabajos que ocurren en momentos distintos:

1. **capturar:** registrar un hecho con la menor fricción posible;
2. **estructurar:** reunir evidencia, redactar una historia y producir
   inteligencia o publicaciones.

Vibeapp se especializa en el primer trabajo. VibePWA se especializa en el
segundo. Ambos usan la misma identidad, servidor y fuente de datos.

## 2. Componentes y responsabilidad

| Componente | Responsabilidad |
| --- | --- |
| Vibeapp | Captura inmediata, cola local, reintentos y contexto móvil |
| VibePWA 2 | Historias, curación visual, evidencia, reportes y publicaciones |
| Railway | Autorización, validación, catálogo, PDF y coordinación |
| Supabase Auth | Identidad y sesión |
| Supabase Database | Ledger, catálogo, historias, eventos y vínculos |
| Supabase Storage | Binarios privados |
| Obsidian | Mapa derivado para curación y aprendizaje |
| Vibepub/MagStudio | Edición editorial posterior |

Obsidian y Vibepub consumen resultados. No son fuentes de transacciones.

## 3. Registro canónico

Una captura conserva:

- `captureId`;
- `idempotencyKey`;
- propietario y espacio;
- intención: evidencia o contexto;
- tipo;
- fecha real del hecho;
- origen y dispositivo;
- texto o referencia al binario;
- SHA-256, MIME y tamaño cuando hay archivo.

Una captura no necesita una experiencia padre. La historia se crea después y
adopta la evidencia que el usuario elige.

## 4. Flujo por tipo de activo

### Texto

1. El dispositivo conserva el texto y su identidad.
2. Envía JSON a `POST /api/captures`.
3. El servidor registra la operación y el catálogo.
4. Responde `complete`.
5. El texto aparece en Evidencia y puede convertirse en narrativa humana.

### Foto

1. El dispositivo calcula SHA-256.
2. Solicita autorización en `POST /api/captures/uploads`.
3. Sube la foto directamente a Storage privado.
4. Confirma en `POST /api/captures/commit`.
5. El servidor verifica tamaño y MIME, registra el activo y responde
   `complete`.

### Audio

Sigue el flujo de foto. Una transcripción de voz humana puede aportar
narrativa; el archivo de audio se conserva como evidencia.

### Video

Sigue el flujo binario. Por encima de 6 MiB usa TUS en bloques de 6 MiB. La
ubicación de reanudación se conserva mientras el cliente mantiene la carga. Si
se pierde la red, se consulta el desplazamiento remoto y continúa desde el
último bloque confirmado.

### Documento

Sigue el flujo binario. OCR o lectura automática son contexto derivado. El
documento no se convierte por sí solo en narrativa de una experiencia.

### Biometría y sensores

Una muestra pequeña viaja como JSON. Un archivo histórico usa carga directa.
Se guarda como contexto y nunca se interpreta un dato ausente como cero.

### Ubicación

Viaja como JSON con su fecha y precisión. Es contexto temporal; no crea una
historia.

### Clima, noticias y agenda

Son contexto. El servidor guarda primero el dato recibido y ejecuta cualquier
enriquecimiento después. Una agenda no crea automáticamente una experiencia.

## 5. Reintentos y trabajo sin conexión

- El archivo permanece en el dispositivo hasta recibir `complete`.
- Todo reintento usa el mismo `captureId` y `idempotencyKey`.
- Repetir la misma operación devuelve el mismo resultado.
- Reutilizar la clave con otro archivo produce un conflicto visible.
- Un timeout no se interpreta como pérdida: el cliente consulta o reintenta.
- `retry_pending` conserva el elemento en la cola.
- `needs_attention` conserva el elemento y explica el motivo.
- Una sesión vencida se renueva por `/api/mobile/auth/refresh`. Las solicitudes
  paralelas comparten una sola renovación.
- Una falla temporal durante la renovación no borra la sesión local. Solo un
  token de renovación rechazado obliga a iniciar sesión otra vez.

## 6. Curación de historias

El editor de Historias permite:

- crear una historia sin evidencia;
- añadir o quitar evidencia sin borrar el archivo;
- editar título, narrativa, área, fecha, lugar y personas;
- borrar una historia y devolver su evidencia a la bandeja;
- usar el mismo conjunto de datos para reportes, hallazgos y publicaciones.

La evidencia original no se destruye al reorganizar una historia.

## 7. Estados y confirmación

| Estado | Comportamiento del usuario |
| --- | --- |
| `received` | El servidor reconoció la operación |
| `storing` | El binario está en curso |
| `binary_stored` | Storage confirmó el archivo |
| `cataloging` | Se crea el registro visible |
| `complete` | Archivo y registro están confirmados |
| `retry_pending` | Se reintenta sin crear un duplicado |
| `needs_attention` | Se conserva y se muestra una causa comprensible |

La interfaz solo muestra “Guardado” después de `complete`.

## 8. Observabilidad

La información técnica vive en `Cuenta > Operación y diagnóstico`. Debe
mostrar:

- disponibilidad de API;
- persistencia;
- versión del contrato;
- estado de capturas;
- último error por etapa;
- operación y captura relacionadas.

No se registran claves, tokens, contraseñas ni contenido sensible completo.

## 9. Seguridad

- Storage es privado.
- Las rutas se separan por usuario.
- La API deriva propietario y espacio desde la sesión; no confía en valores
  enviados por el cliente.
- La clave de servicio nunca llega al navegador o al móvil.
- Las descargas usan enlaces temporales.

## 10. Despliegue

VibePWA 2 se mantiene en paralelo. El orden de promoción es:

1. pruebas locales;
2. migración SQL;
3. canario de un usuario;
4. matriz real de activos;
5. iPhone, iPad, escritorio y Android/emulador;
6. comparación de conteos;
7. promoción;
8. ventana de rollback.

La aplicación anterior no se elimina hasta completar la ventana de rollback.

## 11. Referencias técnicas verificadas

- [Supabase: cargas reanudables TUS](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
- [Supabase: cargar con URL firmada](https://supabase.com/docs/reference/javascript/file-buckets-uploadtosignedurl)
- [Supabase: control de acceso en Storage](https://supabase.com/docs/guides/storage/security/access-control)

Estas referencias confirman el umbral recomendado de 6 MiB, los bloques TUS
de 6 MiB, el uso de tokens firmados y las políticas RLS para Storage privado.
