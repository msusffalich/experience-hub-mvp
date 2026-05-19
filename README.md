# Experience Hub MVP

MVP local basado en el documento `Meta_ecosistema__Universo_de_Experiencias_Ecosistema.pdf`.

## Arranque local

Comando normal:

```bash
node server.js
```

Si Windows/PowerShell deja el servidor en segundo plano inestable, usa:

```bash
node start-server.cjs
```

Ese helper inicia `server.js` desacoplado y deja logs en `server-live-current.log` y `server-live-current.err.log`.

## Alcance ajustado para piloto de 50 usuarios

El cierre inmediato se redefine como un piloto controlado para máximo 50 usuarios. El objetivo es terminar antes con una app estable, usable y auditable, sin esperar automatizaciones de escala masiva.

Incluido en el cierre del piloto: captura, librería, Activos multimodales, Reportes, Diario, Agenda local, Publicaciones con aprobación humana, Supabase/Auth/Storage básico, privacidad, respaldos, importación/exportación y revisión humana de pendientes.

Fuera del cierre inmediato: conectores directos de cuentas, publicación directa en redes, OCR/transcripción automática avanzada, agentes predictivos, telemetría avanzada, colaboración multiempresa y escalamiento masivo. Esos puntos pasan a fase posterior si el piloto valida demanda real.

El semáforo de Administración separa dos momentos: `listo para invitar` significa que se puede iniciar o ampliar el grupo piloto; `piloto cerrado` significa que hasta 50 usuarios ya validaron captura, consulta, análisis, respaldo y exportación sin pérdida de datos.

## Alcance incluido

- Panel con métricas de experiencias, horas, energía media y categoría dominante.
- Próximos eventos de Agenda visibles en el Panel con acceso directo a Agenda, origen importado `.ics`, alerta de día bloqueado y conflicto horario.
- Panel de calidad de captura con completitud, fortalezas, campos débiles y acción recomendada.
- Guía de captura conectada a la calidad de datos para sugerir campos prioritarios antes de guardar nuevas experiencias.
- Diario informativo en el Panel con noticias políticas, economía/finanzas, tecnología e IA, deportes, entretenimiento/eventos, noticias del mundo y horóscopo diario.
- Diario combina GDELT DOC 2.0 y Google News RSS, muestra la fuente activa por sección y se refresca cada 6 horas.
- Diario incluye clima del día con Open-Meteo, multimedia activa y horóscopo activo.
- Diario separa noticias locales y mundiales, adapta consultas al idioma activo y agrega una capa multimodal con imágenes disponibles y enlaces a video/audio por sección.
- Diario incluye lectura breve por titular, con qué está pasando, por qué importa, qué revisar, imagen cuando existe, fuente, fecha, multimedia y enlace a la noticia original.
- Diario permite guardar una noticia detallada como experiencia editable, incluyendo lectura, fuente, fecha, enlace original e imagen editorial cuando existe.
- Al guardar noticias del Diario, la app detecta duplicados por enlace/título/fuente y abre la experiencia existente si ya fue registrada.
- Diario usa rutas internas `#daily=seccion:indice` para abrir detalles y filtra logos/iconos para evitar imágenes engañosas.
- Diario agrega lectura en voz alta del resumen y bloques multimedia para galería, videos y audio/podcasts cuando no hay imagen editorial confiable.
- Diario usa un flujo simplificado en el Panel: Leer Diario, Cartelera y multimedia, Horóscopo y Comando de voz. Cartelera/multimedia abre una ficha interna de opciones concretas; Horóscopo se muestra dentro de la misma ficha.
- La ficha `Cartelera y multimedia` separa cartelera vigente, multimedia disponible y seguimiento en Agenda; muestra previews de imágenes del Diario cuando existen y explica cuándo depende de fuentes externas.
- Administración separa preparación interactiva del Diario y contenido actualizado: los módulos locales pueden estar listos aunque noticias o clima requieran refresco.
- Diario muestra una matriz de confiabilidad que separa contenido real, separación local/mundial, clima, horóscopo, cartelera, multimedia, voz/comandos y vigencia de 6 horas.
- El avance funcional del Diario usa esa matriz real; cartelera, multimedia y voz ya no se cuentan como cerrados por defecto.
- En Diario, `Leer Diario` es el mando de lectura; las noticias reales aparecen debajo separadas en `Noticias locales` y `Noticias mundiales`.
- Diario usa colores suaves por tipo de bloque para diferenciar mando, clima, noticias locales, noticias mundiales, horóscopo y acciones.
- En escritorio ancho, Noticias locales se organiza en cinco columnas horizontales; en pantallas medianas y móviles se adapta a menos columnas.
- Noticias mundiales usa dos columnas amplias en escritorio para facilitar lectura comparativa sin competir con la panorámica local.
- Cartelera y multimedia dependen de fuentes externas; la app muestra opciones concretas y enlaces visibles cuando una pestaña externa no se abre automáticamente.
- Diario muestra un bloque visible de Acciones del Diario con accesos directos a Cartelera, Multimedia, Horóscopo y Comando de voz.
- El bloque fijo de Acciones del Diario se actualiza con el idioma activo para evitar mezclar español e inglés.
- Diario permite programar una revisión de cartelera/eventos en Agenda desde el Panel, respetando días bloqueados y dejando el origen como `daily-briefing`.
- Diario persistente por usuario, lugar e idioma: usa Supabase `daily_briefings` cuando la tabla existe y respaldo local cuando aún no se ha aplicado el SQL.
- Enlaces de cartelera/eventos para cine, conciertos, teatro, eventos del día y exposiciones del lugar seleccionado.
- Botón `Comando de voz` para navegar secciones, actualizar Diario, analizar contexto, abrir reportes/Publicaciones/Manual, cargar ejemplo o iniciar una nueva experiencia cuando el navegador soporta Web Speech.
- Indicador visible de versión cargada y botón `Actualizar app` para recargar la versión vigente cuando el navegador conserva una pantalla anterior.
- El indicador de versión marca `URL anterior` cuando el parámetro `v` de la dirección no coincide con la versión real cargada.
- Cuando la URL está desactualizada, `Actualizar app` se resalta para que sea evidente que conviene recargar la versión vigente.
- Rutina `Diario` para actualizar el resumen cada 6 horas sin afectar el análisis de experiencias.
- Captura manual de experiencias con categoría, objetivo/intención, fecha, duración, estado emocional, energía, ubicación, personas y notas.
- Categoría `Viajes / Paseos` para experiencias de traslados, paseos, recorridos y viajes cortos.
- Adjuntos de imágenes, videos y audio por experiencia, guardados localmente o en Supabase Storage.
- Captura amplia de formatos de imagen, audio y video por MIME o extensión; el panel de adjuntos muestra tipo, formato, tamaño, estado de vista previa y procesamiento previsto. Los formatos sin vista previa nativa se conservan como archivo clasificado.
- Alcance multimedia MVP: imágenes JPG/JPEG, PNG, GIF, SVG, WebP, AVIF, HEIC/HEIF, TIFF, BMP y RAW comunes; audio MP3, WAV, M4A, AAC, FLAC, OGG, OPUS, WMA, AIFF/AIF y AMR; video MP4, MOV, M4V, WebM, MKV, AVI, WMV, MPEG/MPG, 3GP y HEVC. La vista previa depende del soporte nativo del navegador.
- Librería de experiencias con búsqueda, filtro por categoría, filtro por contenido multimedia y filtro por origen.
- Librería y Línea de tiempo muestran el origen de cada experiencia: captura manual, Diario, Agenda, Hallazgo o Proyección.
- Documentos de texto en alcance MVP: TXT, Markdown, HTML, RTF, DOCX y PDF; apps de notas como Obsidian, Notion, OneNote, Apple Notes, Google Keep y Evernote se manejarán primero mediante exportación estándar, dejando APIs y formatos propietarios para fase posterior.
- Captura acepta documentos TXT, Markdown, HTML, RTF, DOCX, PDF, CSV y JSON como adjuntos; TXT/Markdown/HTML/CSV/JSON generan vista previa textual inicial, mientras PDF/DOCX/RTF quedan guardados para extracción posterior.
- Captura muestra una muestra de texto en la tarjeta del adjunto para documentos TXT/Markdown/HTML/CSV/JSON antes de guardar.
- Librería, Línea de tiempo y tiras multimedia muestran documentos como fichas documentales, no como imágenes, para evitar vistas rotas cuando el adjunto es PDF, DOCX, TXT, Markdown, CSV o JSON.
- El selector de adjuntos en Captura es multilenguaje y nombra explícitamente imágenes, video, audio y documentos.
- Activos multimodales separa disponibilidad operativa de estado de análisis: un archivo puede estar guardado y reutilizable, pero seguir pendiente de extracción, OCR, transcripción o descripción visual.
- Activos multimodales incluye filtro por estado de análisis para aislar archivos listos, pendientes, documentos que requieren extracción, audios para transcripción, imágenes para descripción/OCR y videos para revisión audiovisual.
- Activos multimodales muestra una bandeja de pendientes de análisis por tipo de procesamiento; cada tarjeta filtra directamente el grupo correspondiente.
- Exportación JSON de pendientes de análisis multimodal con resumen por grupo, estado, detalle, próxima acción sugerida y referencia a la experiencia vinculada, sin incluir archivos pesados.
- Exportación CSV de pendientes de análisis multimodal para revisión en hojas de cálculo, manteniendo identificador del activo y campos editables como texto analítico, nota y etiquetas.
- Plan de revisión multimodal dentro de Activos multimodales con próximos pendientes visibles, acciones sugeridas, sugerencia directa de texto analítico, filtro directo por grupo y copia de `assetId`.
- Exportación Markdown `Checklist de revisión` para trabajar pendientes de OCR, transcripción, descripción visual o revisión audiovisual en Obsidian, Notion, Word o cualquier editor.
- Importación de metadatos desde JSON o CSV de inventario/pendientes para actualizar texto analítico, nota y etiquetas sin modificar los archivos multimedia originales.
- Importación segura de metadatos: las filas vacías se ignoran y solo se limpian metadatos cuando la columna `clearMetadata` se marca explícitamente.
- Auditoría de importación de metadatos con conteo separado de actualizados, limpiezas explícitas, filas vacías ignoradas y activos no encontrados.
- Plantilla CSV segura para completar metadatos de activos fuera de la app; incluye columnas esperadas y una fila de ejemplo con `assetId` vacío.
- Cada tarjeta de activo permite copiar el `assetId` para pegarlo en plantillas CSV o flujos externos de metadatos.
- `CSV edición` exporta los activos filtrados en una tabla mínima reimportable para completar texto analítico, notas y etiquetas.
- Guía compacta en Activos multimodales para el flujo de metadatos: filtrar, exportar CSV, editar, importar y revisar auditoría.
- Botón `Limpiar filtros` en Activos multimodales para volver al inventario completo sin resetear controles manualmente.
- Resumen `Filtros activos` en Activos multimodales para distinguir inventario completo de vistas filtradas.
- Chips de filtros activos removibles individualmente para ajustar la vista sin reiniciar todos los filtros.
- Ordenamiento de Activos multimodales por fecha reciente, fecha antigua, nombre, tipo o estado de análisis.
- Acción por lote `Sugerir texto filtrados` para generar texto analítico inicial en activos visibles que aún no tienen texto, sin reemplazar textos existentes.
- Administración mide el cierre del flujo de activos con controles granulares: filtros, chips, orden, CSV, checklist Markdown, plantilla, importación segura, auditoría, copia de ID y sugerencias por lote.
- Activos multimodales incluye una preparación real del flujo: inventario, IDs estables, exportaciones probadas, checklist, auditoría de importación, metadatos guardados, sugerencias locales, revisión humana visible y pendientes por tipo de procesamiento.
- Administración usa esa preparación real para el avance funcional/técnico, evitando contar como cerrado un flujo multimedia que todavía no fue probado por el usuario.
- Administración muestra `Plan de revisión multimodal` como estado operativo separado para distinguir inventario funcional de activos que aún requieren OCR, transcripción, descripción o revisión audiovisual.
- Tarjetas accionables en Salud del sistema: los estados con acción clara muestran `Abrir` para navegar al módulo correspondiente, como Activos multimodales filtrado en pendientes.
- La navegación manual y programática usa el mismo activador de vistas y sincroniza automáticamente `view=` en la URL para que la dirección del navegador coincida con la sección visible.
- Sección `Activos multimodales` con inventario filtrable por texto, tipo, categoría, disponibilidad, origen demo/usuario, presencia de texto analítico y rango de fecha; muestra métricas de activos reales, activos con texto analítico, texto pendiente, texto sugerido localmente, estado analítico por tarjeta, tipo, formato, idioma, trazabilidad, almacenamiento, preparación de Storage privado, caché local de vista previa, etiquetas iniciales, metadatos manuales editables, sugerencia de texto analítico inicial, disponibilidad de reutilización, usos recomendados, experiencia vinculada, exportación JSON/CSV ligera, importación de metadatos desde JSON de inventario y resumen auditable de la última importación.
- Sección `Agenda` con calendario visual diario/semanal, eventos locales, filtros por día/semana/todo, tipos de agenda, estados, días bloqueados locales, detección de conflictos, conversión de evento en experiencia, exportación local `.ics` e importación local de archivos `.ics` desde calendarios externos.
- Sección `Publicaciones` con generación de borradores narrativos desde reportes o últimas experiencias, aprobación humana con marca en archivos exportados, historial del borrador, diseños visuales seleccionables que se conservan en HTML exportado, vista imprimible embebida, enlaces visibles de descarga HTML/Markdown, paquete editorial JSON, editor de título/resumen/cuerpo, documento final, guía de salida, lista de cierre prepublicación, curaduría manual de multimedia sugerida con contexto editorial de activos, preparación editorial, estilos, canales, limpieza de privacidad, márgenes/saltos de página para impresión y exportación.
- Reporte de experiencias con resumen ejecutivo, tabla y descarga JSON.
- Reportes incluye `Paquete de aceptación del reporte` para evidenciar datos reportables, narrativa, gráficas y exportaciones JSON, CSV, HTML imprimible y PDF/respaldo.
- La preparación del piloto exige probar el paquete de aceptación de Reportes antes de considerar cerrado ese módulo.
- Bitácora de memoria viva dentro del reporte con momento destacado, aprendizaje recuperado y continuidad sugerida.
- Confiabilidad de reporte basada en calidad de captura del conjunto filtrado.
- Hallazgos de reporte con tendencia, foco dominante, riesgo y acción recomendada.
- Conversión de hallazgos accionables en eventos de Agenda con fecha sugerida, prioridad, descripción y recordatorio.
- Programación de la siguiente acción sugerida por la Proyección inicial del Reporte en Agenda.
- Gráficas de reporte para tendencia de energía, distribución por categoría y saturación/volumen.
- Evidencia multimodal en Reportes con activos que contienen etiquetas manuales, notas o texto analítico, incluida en JSON y HTML imprimible.
- Lecturas e indicadores del reporte con tarjetas visuales, estados por nivel, orbes de puntaje y señales accionables.
- Desglose de reporte por categoría con horas, energía media, saturación y adjuntos.
- Lectura por categoría del plan maestro con foco, riesgo y acción sugerida para cada categoría visible.
- Índices humanos del plan maestro en Reportes: bienestar, estabilidad emocional, carga de estrés, conexión social, balance vida-trabajo, resiliencia, energía diaria y satisfacción vital.
- Correlaciones humanas del plan maestro en Reportes: trabajo/saturación, socialización/energía, recuperación/energía, aprendizaje/resiliencia y contexto externo/carga emocional.
- Filtros de reporte por periodo, categoría, persona y objetivo.
- Hallazgos accionables con acción sugerida por patrón detectado.
- Hallazgos visuales con confianza, estado por tipo de señal y acción recomendada.
- Preguntas al sistema con ejemplos clicables y respuesta visual: coincidencias, energía media, categorías principales y experiencias relacionadas.
- API local en Node.js con endpoints para perfil, salud del sistema y experiencias.
- Persistencia del servidor local en `data/experience-store.json` o Supabase mediante `STORAGE_ADAPTER=supabase`.
- Imágenes, videos y audio en Supabase Storage cuando el adaptador Supabase está activo.
- Supabase Auth para sesiones por correo electrónico/contraseña cuando el adaptador Supabase está activo.
- Políticas RLS para que cada usuario gestione solo su perfil y sus experiencias.
- Bucket `experience-media` privado con URLs firmadas para vistas previas multimedia.
- Políticas Storage en `database/auth-rls.sql` para que cada usuario autenticado solo acceda a objetos dentro de su carpeta `user_id/`.
- Análisis de impacto contextual por lugar con clima de Open-Meteo y noticias geopolíticas de GDELT.
- Botón para analizar impacto ambiental/geopolítico con la ubicación principal detectada en las experiencias.
- Respaldo geopolítico con Google News RSS cuando GDELT no entrega artículos, mostrando fuente y motivo en el Panel.
- Respuesta resiliente del análisis contextual: si el geocodificador, clima o noticias fallan, el panel muestra estado y motivo en lugar de interrumpir el Panel.
- Visualización editorial del impacto geopolítico con señal principal, tarjetas secundarias, fuente, fecha y explicación contextual.
- Plan maestro almacenado en `data/human-experience-blueprint.json` y hoja de ruta en `data/human-experience-blueprint-roadmap.md`.
- Búsqueda semántica con pgvector en Supabase, embeddings configurables y respaldo local.
- Captura de audio desde navegador usando MediaRecorder cuando está disponible.
- Transcripción experimental de audio con Web Speech API cuando el navegador la soporta.
- Manejo multilenguaje ES/EN con selector de idioma y preferencia guardada en perfil.
- Etiquetas de categorías traducibles en UI; los valores internos permanecen estables para filtros, reportes y Supabase.
- Plantillas rápidas para revisión diaria, reunión de trabajo y chequeo de energía.
- Línea de tiempo con búsqueda, filtro por categoría y filtro por estado emocional.
- Mapa de Experiencias con grafo de interrelaciones por tiempo, categoría, personas, lugar, objetivo y energía.
- Selección de nodos en Mapa de Experiencias con detalle, relaciones conectadas y acceso a línea de tiempo.
- Rutas del Mapa de Experiencias para detectar recorridos de energía alta, saturación, aprendizaje y vínculos sociales/lugares.
- Preguntas al Mapa de Experiencias con intención detectada, rutas resaltadas, lectura tipo Codex y exportación Markdown enriquecida para Obsidian.
- Reporte con lectura integrada que cruza métricas, hallazgos y rutas del Mapa de Experiencias.
- Hallazgos con prioridad, evidencia, confianza y acción sugerida.
- Exportaciones JSON, HTML imprimible y PDF alineadas con la lectura integrada del reporte.
- Hallazgos generados localmente con reglas simples.
- Vista de Automatizaciones con Skills funcionales, rutinas activables y MCP/conectores del ecosistema.
- Rutinas sincronizadas con el servidor local, ejecución manual y revisión programada cada minuto.
- Resumen operativo de rutinas con activas, pausadas, próximas 24 h y fechas bloqueadas.
- Notificaciones visuales en la barra superior cuando una rutina programada queda registrada.
- Controles de frecuencia, hora preferida, día semanal, pausa, ventana activa y fechas bloqueadas para cada rutina desde la vista Automatizaciones.
- Estado y resultado visible de la última ejecución de cada rutina.
- Historial operativo reciente de rutinas dentro de la vista Automatizaciones.
- Ejecución manual de rutinas con refresco inmediato de estado, resultado e historial.
- Panel operativo simulado para servicios y dispositivos.
- Administración separa avance funcional y avance técnico para trabajar ambos carriles en paralelo.
- Administración muestra avance total estimado, separando MVP local y producto completo al 100%.
- Administración muestra preparación analítica multimodal con porcentaje de activos que ya tienen texto analítico.
- Diagnóstico de cierre técnico Supabase desde Administración para revisar configuración, Auth, RLS, experiencias, perfil, Diario persistente, Storage privado y búsqueda semántica.
- Compuerta Supabase del piloto en Administración: configuración, sesión, diagnóstico limpio, Storage privado, prueba real y cola sin conexión deben estar listos antes de considerar Supabase apto para invitar usuarios.
- Acciones de cierre por cada resultado del diagnóstico Supabase para saber qué corregir y volver a verificar.
- Prueba real Supabase desde Administración: crea experiencia y archivo temporales, valida lectura/búsqueda y limpia los datos de prueba.
- La prueba real Supabase valida que el archivo temporal tenga URL firmada funcional y que la ruta pública directa quede bloqueada.
- Botones accionables en resultados de diagnóstico para abrir acceso o volver a Administración cuando la corrección puede hacerse dentro de la app.
- Retorno automático después de login cuando el usuario llega desde Verificar Supabase o Probar flujo real.
- Estado de Auth corregido: solo se muestra conectado cuando existe `access_token`; si la sesión está incompleta, se pide entrar de nuevo.
- Limpieza automática de sesión local cuando Supabase rechaza el token guardado con 401.
- Renovación automática de sesión Supabase con `refresh_token` antes de pedir login de nuevo.
- Panel `Estado de acceso` en Supabase Auth con configuración, token activo, token de renovación y retorno pendiente.
- Formulario Auth con Enter para iniciar sesión, bloqueo de botones durante la llamada y próximo paso visible.
- Panel de Cola sin conexión en Administración con pendientes, intentos, fecha, reintento manual y vaciado con confirmación.
- Motivo y guía de siguiente acción por cambio sin conexión: entrar, revisar servidor o reintentar.
- Botón `Abrir acceso` desde Cola sin conexión cuando falta sesión, con retorno a Administración y sincronización automática.
- Acciones por pendiente sin conexión: revisar en Captura o descartar individualmente sin vaciar toda la cola.
- Reintento individual por pendiente sin conexión sin procesar toda la cola.
- Política de resolución visible por pendiente sin conexión, con acción `Usar versión local` para marcar la copia del navegador como versión final del próximo reintento.
- Limpieza selectiva de pendientes de ejemplo actuales o heredados en Cola sin conexión, sin tocar cambios reales.
- Panel `Datos de prueba` en Administración para ver ejemplos locales, sincronizarlos con Supabase al iniciar sesión o eliminarlos.
- Backlog paralelo en Administración con tareas funcionales/técnicas, estado listo/pendiente y acceso directo al módulo relacionado.
- Backlog paralelo muestra preparación analítica multimodal con activos que ya tienen texto y activos pendientes.
- El botón de Base multimodal en el backlog abre directamente los activos sin texto analítico cuando hay pendientes.
- Administración incluye el estado del Mapa de Experiencias en salud del sistema, avance funcional y backlog paralelo.
- Comandos de voz visibles en el Diario con estado en pantalla, botón de micrófono y ejemplos clicables para probar el flujo aunque Web Speech no esté disponible.
- Barra superior adaptable para que Idioma, Versión, Actualizar app y acciones principales no queden ocultas en pantallas estrechas.
- Proyección inicial en Reportes: hipótesis operativa local con confianza, factores influyentes y siguiente acción, separada de hallazgos históricos y sin presentarse como diagnóstico.
- Exportación de Reportes reforzada: HTML imprimible y PDF nativo estructurado con lectura integrada, proyección inicial, KPIs, categorías, rutas y evidencia multimodal disponible.
- Publicaciones permite copiar el texto final o el HTML final al portapapeles para salida manual a email, mensajería, CMS o redes mientras los conectores directos quedan para fase posterior.
- Corrección automática de URL anterior: la app actualiza la dirección visible a la versión vigente y muestra un aviso con recarga opcional.
- Nuevas capacidades estructuradas desde blueprints externos: Agenda Inteligente, Arquitectura Multimodal/Multilenguaje/Multidispositivo y Publicaciones Inteligentes.
- Especificaciones guardadas en `data/ecosystem-capabilities-blueprints.json` y roadmap de ejecución en `data/ecosystem-capabilities-roadmap.md`.
- Manual del Usuario integrado en ES/EN y ligado al selector de idioma.
- Panel de perfil para nombre, correo electrónico de cuenta y zona horaria.
- Perfil demográfico opcional con género, año de nacimiento y tipo de experiencia dominante.
- Guardado de perfil con copia local cuando no hay sesión activa y sincronización con Supabase cuando el usuario está autenticado.
- Matriz de parámetros por edad/género para ajustar el impacto ambiental, geopolítico y biométrico por perfil.
- Esquema de análisis documentado en el Manual del Usuario: captura base, clasificación, contexto externo, perfil y síntesis accionable.
- Controles de privacidad, respaldo JSON integral y restauración del estado local.
- Respaldo completo de experiencias, Agenda, días bloqueados, publicaciones, metadatos de activos, perfil, Diario, rutinas, privacidad y cola sin conexión; la restauración reaplica los controles de privacidad sin guardar la clave local.
- Confirmación previa a restaurar respaldos con resumen de esquema, versión, experiencias, Agenda, días bloqueados, publicaciones, metadatos y cola sin conexión.
- Verificación de integridad SHA-256 en respaldos nuevos y aviso al restaurar si el archivo fue modificado, quedó incompleto o no trae marca de integridad.
- Limpieza local completa para iniciar carga real: vacía experiencias, Agenda, días bloqueados, publicaciones, metadatos, perfil local, Diario, rutinas y cola sin conexión, conservando sesión e idioma.
- Auditoría ligera del último respaldo, restauración o limpieza local en Administración, con acción, fecha, versión y conteos principales.
- Botones directos de respaldar y restaurar en Administración, usando el mismo flujo seguro de la barra superior.
- Panel `Cierre del piloto` en Administración con avance del MVP local, piloto de 50 usuarios, producto completo, capacidades listas visibles, bloqueos reales del piloto y capacidades reservadas para fases posteriores.
- Exportación del panel `Cierre del piloto` como JSON estructurado o Markdown, con capacidades listas, bloqueos del piloto y fase posterior.
- Tablero `Plan de cierre paralelo` en Administración para agrupar frentes funcionales, técnicos, piloto, QA/manual e integraciones, con responsable sugerido, estado y siguiente acción.
- Panel `Reglas de desarrollo` en Administración con criterios permanentes: actualizar Manual/Admin, reforzar robustez/agilidad y seguir patrones probados.
- Panel `Cierre operativo del MVP` en Administración como compuerta principal del producto: captura, persistencia, librería, activos, reportes, exportaciones, respaldo y claridad de bloqueos.
- `Cierre operativo del MVP` permite registrar una prueba central, exportar evidencia Markdown/JSON y cargar datos de prueba suficientes para validar el flujo real sin distraerse con funciones secundarias.
- `Ejecutar prueba central` valida el flujo base sin descargar múltiples archivos: registra evidencia de activos, exportaciones de reporte, respaldo con integridad y resultado de la compuerta.
- `Ruta de prueba real con 5 usuarios` dentro de Cierre operativo del MVP permite marcar pasos hechos por una persona con datos reales: crear experiencia, adjuntar archivo, buscar/editar, revisar reporte, exportar evidencia y revisar respaldo.
- Cada paso de la ruta real tiene botón `Abrir` al módulo correcto y exportación Markdown para documentar evidencia humana del piloto.
- La ruta real muestra `Siguiente paso pendiente` con botón principal para ejecutar la prueba en orden.
- La prueba real registra responsable, grupo piloto y notas/bloqueos observados; esos datos se incluyen en respaldo y exportación Markdown.
- Cada paso de la prueba real permite guardar evidencia breve para explicar qué se validó, qué archivo o registro se usó y qué resultado observó el usuario.
- `Guardar y completar` registra evidencia y cierra un paso de la prueba real en una sola acción; exige evidencia antes de marcarlo como completado.
- La sesión de prueba real registra inicio y cierre de la validación humana; solo puede terminar cuando todos los pasos tienen evidencia, están completos y hay responsable asignado.
- Administración muestra avance separado de pasos completados y evidencias guardadas; el cierre final exige ambos al 100%.
- `Paquete de cierre del MVP central` exporta en Markdown o JSON decisión, siguiente acción, compuerta operativa, prueba humana, evidencias, pendientes y auditorías clave.
- Administración muestra una vista previa del paquete de cierre antes de exportar, con decisión, siguiente acción, métricas principales y pendientes abiertos.
- La vista previa del paquete de cierre incluye botón directo para abrir la siguiente acción pendiente del MVP central.
- Al abrir una acción pendiente del MVP central, la app muestra una banda de retorno para volver al cierre, guardar evidencia y continuar la prueba real.
- Los botones `Abrir` de la compuerta y de cada paso real también muestran retorno al cierre operativo, para probar módulos sin perder el punto de control del MVP.
- Cuando la banda de retorno viene desde un paso real, permite escribir evidencia, marcar el paso como completado y volver al cierre operativo en una sola acción.
- `Cierre final del MVP` solo se habilita cuando la compuerta operativa, la prueba humana real y el responsable están completos; registra fecha, versión, decisión y puntaje final.
- Diario, conectores externos, OCR avanzado, transcripción automática e IA predictiva quedan fuera de la compuerta central salvo que bloqueen captura, reportes, activos, exportaciones o respaldo.
- Panel `Verificación rápida del MVP` en Administración para probar versión cargada, Supabase, Reportes, Activos multimodales, privacidad/respaldo y preparación del piloto, con registro interno, copiado/exportación Markdown/JSON con decisión, siguiente acción, tendencia, historial reciente, última evidencia y retorno guiado desde Acceso cuando falta sesión.
- Panel `Ruta MVP completa` en Administración para validar el flujo de punta a punta: captura, calidad de datos, evidencia multimodal, hallazgos, reportes, publicaciones, privacidad, respaldo y preparación del piloto, con primer bloqueo y acceso directo al módulo correspondiente.
- Panel `Servidor local y API` en Administración para confirmar disponibilidad del backend local, última verificación, latencia, servicio y modo de datos, con reintento visible cuando se trabaja en modo local.
- Protección de fechas inválidas: los datos incompletos se muestran como `Sin fecha` y no rompen Panel, Diario, reportes ni Administración.
- Manual con controles responsivos, filtros activos visibles y recuperación de pantalla vacía cuando una búsqueda o filtro oculta todas las secciones.
- Panel `Calidad de interfaz` en Administración para detectar filtros que vacían el Manual, estado del servidor/API, versión cargada, datos de prueba, respaldo y ruta MVP, con copia/exportación Markdown/JSON de evidencia visual sin contenido privado.
- Paquete piloto completo incluye evidencia QA de `Verificación rápida` y `Calidad de interfaz` en JSON/Markdown, además de preparación, invitación, pruebas, participantes, feedback y acta.
- Acción `Registrar evidencia QA` desde el Acta de cierre para capturar Verificación rápida y Calidad de interfaz antes de exportar el paquete piloto.
- La evidencia QA registrada afecta `Preparación del piloto` y aparece como bloqueo accionable si falta antes de ampliar usuarios.
- Panel `Preparación del piloto` en Administración con recomendación práctica: no invitar, prueba interna con 5 usuarios, iniciar con 10-15 usuarios o invitar hasta 50 usuarios.
- `Preparación del piloto` muestra `Bloqueos prioritarios` con hasta cinco pendientes accionables, explicación de impacto y acceso directo al módulo correspondiente.
- Las acciones de preparación resaltan temporalmente el panel de destino para que el usuario vea qué debe revisar.
- Exportación/copia de `Preparación del piloto` como JSON o Markdown para auditoría, revisión interna u Obsidian.
- `Kit de invitación piloto` en Administración con grupo recomendado, mensaje copiable, checklist de onboarding y exportación Markdown.
- `Plan de pruebas piloto` en Administración con escenarios mínimos, avance, reinicio y exportación Markdown para validar el MVP antes de ampliar el grupo.
- `Acta de cierre piloto` en Administración con decisión sugerida, decisión formal guardable, responsable, notas de cierre, historial de decisiones, preparación, pruebas, participantes, feedback, pendientes y exportación JSON/Markdown.
- `Paquete piloto` exportable desde el acta en JSON o Markdown, con vista previa de contenido y consolidación de preparación, invitación, plan de pruebas, participantes, feedback y acta de cierre.
- Panel `Integraciones externas` en Administración para documentar decisiones API/MCP, reutilización de código, GitHub compartido o separación de proyectos; incluye contrato mínimo copiable para recursos, autenticación, eventos, adjuntos, privacidad, errores y criterios de aceptación. Clio queda tratado como candidato API/MCP antes de copiar código.
- `Manual del Usuario` con búsqueda, contador de resultados, filtros por sección y estado de revisión, barra de progreso, acciones de marcar todo/reiniciar revisión, copiado de secciones y exportación Markdown/HTML imprimible en español o inglés.
- El progreso de revisión del manual alimenta `Salud del sistema` y `Preparación del piloto` como señal de onboarding.
- El Panel muestra un resumen de preparación del piloto con manual, pruebas, participantes, feedback, siguiente acción recomendada, pendientes principales, copiado de resumen y acceso al acta.
- `Participantes piloto` en Administración con nombre, correo, segmento, estado, checklist de onboarding, exportación CSV y control del límite de 50 usuarios; se incluye en respaldo/restauración.
- `Registro de feedback piloto` en Administración con módulo, severidad, estado, resolución y exportación CSV; se incluye en respaldo/restauración.
- Feedback piloto alto o bloqueante abierto afecta `Preparación del piloto` y aparece en `Salud del sistema`.
- Copiado rápido del resumen de `Cierre del piloto` al portapapeles.
- Restauración de respaldos JSON normales o cifrados con Clave local.
- Carga de datos de ejemplo marcados como datos de prueba, con cobertura amplia para probar reportes, hallazgos, filtros, adjuntos multimodales, activos con metadatos/texto analítico demo, Agenda con eventos exportables, publicaciones, línea de tiempo y eliminación selectiva con `Eliminar ejemplo`.
- Los datos de ejemplo permanecen visibles en modo local aunque Supabase esté activo y todavía no haya sesión iniciada.
- Persistencia local mediante API Node, con respaldo en `localStorage` si la API no está disponible.
- Cola sin conexión local para guardar/borrar experiencias cuando la API no está disponible.
- Modo sensible con exportación/almacenamiento local cifrado con WebCrypto AES-GCM.
- Panel lateral de privacidad con ayuda breve para Procesamiento local, Analítica anónima, Modo sensible y Clave local.
- Botón `Aplicar recomendado` en privacidad para activar procesamiento local, apagar analítica anónima y activar modo sensible antes de escribir la Clave local.
- Estado recomendado de privacidad con verificación visual de procesamiento local, analítica apagada, modo sensible y Clave local.
- Desbloqueo de datos locales cifrados mediante clave local opcional, con estado visible, advertencia de pérdida de clave, mostrar/ocultar clave y aplicación explícita de clave a los datos actuales.

## Ejecutar

Ejecuta el servidor Node local:

```bash
node server.js
```

Luego abre `http://localhost:5174/index.html`.

Endpoints útiles:

```bash
GET /api/health
GET /api/supabase/diagnostics
POST /api/supabase/self-test
GET /api/profile
PUT /api/profile
GET /api/experiences
POST /api/experiences
PUT /api/experiences/:id
DELETE /api/experiences/:id
POST /api/media
GET /api/context/impact?location=San%20Juan
GET /api/daily-briefing?location=San%20Juan&locale=es
GET /api/config
POST /api/search/semantic
POST /api/embeddings/backfill
POST /api/transcribe
GET /api/jobs
POST /api/jobs/embeddings
GET /api/routines
PUT /api/routines/:id
POST /api/routines/:id/run
POST /api/report/pdf
```

El contrato Supabase/PostgreSQL inicial está en `database/schema.sql`. Las políticas de autenticación, RLS y bucket privado están en `database/auth-rls.sql`. La preparación para búsqueda vectorial con pgvector está en `database/semantic-search.sql`.

Nota: `database/schema.sql` agrega columnas opcionales `gender`, `birth_year` y `experience_type` a `profiles`. El servidor local también mantiene `data/profile-parameters.json` como respaldo por usuario para no depender de una migración inmediata.

## Usar Supabase

1. Crea un proyecto en Supabase.
2. Abre el SQL Editor y ejecuta `database/schema.sql`.
3. Copia `.env.example` a tu configuración local y define:

```bash
STORAGE_ADAPTER=supabase
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=tu_publishable_o_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
SUPABASE_STORAGE_BUCKET=experience-media
LOCAL_USER_ID=00000000-0000-0000-0000-000000000001
EMBEDDINGS_PROVIDER=local-hash
EMBEDDING_DIMENSIONS=384
```

4. Inicia el servidor con esas variables de entorno y abre `http://localhost:5174/index.html`.
5. Ejecuta `database/auth-rls.sql` para activar RLS real, aplicar GRANT explícitos para Data API y cambiar `experience-media` a privado.
6. Ejecuta `database/semantic-search.sql` para habilitar pgvector, el RPC `match_experiences()` y sus permisos `EXECUTE`.
7. Crea una cuenta desde la vista de Supabase Auth de la app e inicia sesión.
8. En Administración, pulsa `Actualizar embeddings` para poblar los vectores de experiencias existentes.

Nota de seguridad: `SUPABASE_SERVICE_ROLE_KEY` debe vivir solo en el servidor local. No la pongas en `app.js` ni en el navegador. El frontend solo recibe la clave publishable/anon para iniciar sesión; las subidas de adjuntos y las URLs firmadas pasan por el servidor local.

Nota de compatibilidad Supabase: en proyectos recientes, las tablas nuevas pueden no quedar expuestas automáticamente por la Data API. Por eso `database/auth-rls.sql` incluye `GRANT SELECT, INSERT, UPDATE, DELETE` para `authenticated` y `service_role` sobre `profiles`, `experiences` y `daily_briefings`. RLS sigue siendo obligatorio para controlar filas por usuario.

Para embeddings reales con OpenAI, define en `.env`:

```bash
EMBEDDINGS_PROVIDER=openai
OPENAI_API_KEY=tu_api_key
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=384
```

Para transcripción de audio largo en el servidor local, define:

```bash
TRANSCRIPTION_PROVIDER=openai
OPENAI_API_KEY=tu_api_key
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

## Siguiente incremento recomendado

- Mantener `manualContent` en `app.js` actualizado cada vez que cambie una función visible para usuario.
- Cerrar primero la base multimodal: modelo de activos, metadatos, idioma, dispositivo, vistas previas y búsqueda.
- Mantener Agenda Inteligente MVP y preparar conectores externos solo después de cerrar permisos, privacidad y confirmaciones.
- Mantener Publicaciones Inteligentes MVP y avanzar luego hacia curaduría multimedia avanzada, plantillas visuales y conectores externos.
- Agregar excepciones por fecha y calendario para saltar feriados, vacaciones o días bloqueados.
- Mantener PDF nativo estructurado y dejar diseño editorial avanzado para una fase posterior con motor PDF especializado.
- Mantener el flujo de clave local con advertencias visibles; la recuperación criptográfica sigue dependiendo de conservar la clave del usuario.
- Mantener resolución visible de cola sin conexión; la comparación profunda de versiones remotas queda para conectores externos y auditoría avanzada.

## Fuentes externas de contexto

- Clima/geocoding: Open-Meteo, sin API key para uso no comercial.
- Noticias geopolíticas: GDELT DOC 2.0 API.



