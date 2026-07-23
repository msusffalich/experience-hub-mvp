# Guía integral del ecosistema Vibe

Versión de referencia: 2026-07-23  
Propósito: explicar el ecosistema completo sin confundir experiencia, evidencia, contexto, plataforma o fuente de verdad.

## Resumen ejecutivo

Vibe es un ecosistema de memoria y comprensión de experiencias humanas. Su diseño separa dos tiempos naturales: **capturar hechos cuando ocurren** y **darles estructura cuando el usuario puede entenderlos**. Esta separación evita dos errores: obligar a inventar una historia antes de vivirla, o convertir cada foto, lectura biométrica o ubicación en una experiencia falsa.

El sistema sirve tanto a quien quiere recordar y organizar su vida como a quien desea observar patrones de trabajo, salud, aprendizaje, relaciones o bienestar. La misma base permite ambos usos: primero conserva hechos y relatos; después genera reportes, hallazgos, publicaciones y conocimiento conectado.

## Las piezas del ecosistema

| Pieza | Rol principal | No debe convertirse en |
| --- | --- | --- |
| **Vibeapp** | Captura móvil y contexto cercano al usuario. | Un panel complejo de análisis o curación. |
| **VibePWA** | Estructura historias, revisa datos, analiza y opera. | Un sustituto de cámara, sensores o permisos nativos. |
| **Servidor + Supabase** | Registro común, autenticación, archivos privados y sincronización. | Una segunda interfaz para uso cotidiano. |
| **Obsidian + Claude PC** | Bóveda de conocimiento, curación humana y análisis de notas exportadas. | Una base paralela que reescribe a Vibe. |
| **VibePub** | Edición posterior y distribución externa de publicaciones. | La fuente de datos de experiencias. |

La fuente única de verdad de experiencias, eventos, evidencia y contexto es el backend/Supabase. Las cachés, colas y la bóveda Obsidian son capas de transporte, resiliencia o lectura; no reemplazan ese registro.

## Modelo de información

`Persona -> Experiencia -> Evento -> Evidencia / dato`

**Persona** es el dueño de los datos y puede usar grupos privados para separar Familia, Viaje, Proyecto o Equipo.

**Experiencia** es un episodio vivido con rango de tiempo y significado coherente.

**Evento** es un submomento selectivo dentro de una experiencia. Puede tener narrativa propia, pero sigue siendo evento hasta que el usuario lo promueve.

**Evidencia intencional** incluye fotos, voz, video, texto y documentos. Puede existir sin experiencia y esperar adopción.

**Contexto ambiente** incluye biometría, GPS, clima, noticias y agenda. Se almacena por fecha/hora y enriquece historias sin convertirse en una experiencia por sí mismo.

## Dos flujos que ocurren en tiempos diferentes

### 1. Captura: Vibeapp primero

La captura debe ser rápida, barata y posible aun cuando la historia todavía no esté clara. Vibeapp recoge texto, voz, foto, video, documento, ubicación y contexto móvil. Cada captura se sella con fecha, cuenta, grupo/persona y una clave de idempotencia para impedir duplicados durante reintentos.

La evidencia sin padre llega a la Bandeja de evidencia. No se muestra como experiencia, evento vivido, reporte ni nota de Obsidian.

### 2. Estructura y curación: VibePWA después

VibePWA permite elegir un conjunto de evidencia por fecha, escribir una narrativa, establecer un rango de tiempo y guardar una experiencia. Luego permite eventos internos, adopción de evidencia y curación: mover, soltar, unir, dividir, promover o degradar.

La adopción vincula; no borra. La curación reorganiza; no destruye una historia silenciosamente. Los antecedentes de una fusión, división o degradación permanecen trazables y no cuentan como historias activas en reportes, publicaciones ni mapa.

## Narrativa humana

Narrativa significa lenguaje humano que cuenta lo vivido. Es válida cuando proviene de texto escrito, voz transcrita o video narrado.

No es narrativa: nombres de archivo, etiquetas de una palabra, visión automática, OCR, biometría, GPS, clima, noticias ni metadatos. Esos datos pueden ser evidencia o contexto muy útil, pero no sustituyen el relato.

Una experiencia está narrada si contiene narrativa propia o si alguno de sus eventos tiene narrativa humana. Las métricas cuentan experiencias narradas, no fragmentos de texto.

## Taxonomía para clasificar sin confundir

Las categorías de actividad que pueden definir una experiencia incluyen Trabajo, Paseo/Viaje, Aprendizaje, Social, Entretenimiento, Creatividad y Espiritualidad. Salud narra cuando describe un episodio vivido, por ejemplo una consulta médica; la biometría de salud es contexto.

Bienestar es una dimensión o estado, no una actividad. Hogar es un lugar, no una categoría de experiencia. Compras requiere vivencia real para ser experiencia; una compra rutinaria es un registro breve, no necesariamente una historia.

## Cómo se usa la información

1. **Librería y Mapa** organizan memoria, conexiones y continuidad.
2. **Reportes** explican períodos, grupos o temas con evidencia y datos disponibles.
3. **Hallazgos** convierten patrones en recomendaciones comprensibles.
4. **Publicaciones** crean un PDF editorial cronológico a partir de un alcance y evidencia seleccionados. VibePub puede refinarlo para distribución externa.
5. **Obsidian** recibe una exportación curada: experiencias narradas en `02_Experiences`, multimedia adoptada en `04_Assets` y productos regenerables en `05_Generated`.

## Reglas de sincronización

- Una captura se considera completa cuando el servidor la acepta y VibePWA puede leerla.
- La cola móvil puede reintentar, pero nunca debe duplicar registros.
- Los archivos se guardan en Storage privado y se consultan con URLs firmadas de duración limitada.
- El contexto lento, como clima o noticias, se enriquece después de guardar para no bloquear una captura.
- Una agenda crea o actualiza un compromiso futuro; no crea automáticamente una experiencia ni un evento vivido.

## Privacidad y control

Cada usuario ve sus propios datos. Los grupos/personas son subgrupos privados, no cuentas independientes. Los administradores de producto pueden operar la plataforma, pero no cambian esta propiedad de datos.

Antes de una baja de cuenta se genera respaldo y existe confirmación explícita. Archivar un grupo no borra experiencias históricas. El borrado de evidencia o historias debe ser consciente, reversible mediante respaldo cuando corresponda y trazable.

## Límites actuales y evolución

Vibeapp está validado en iPhone/iPad para los flujos ya probados. Android, Samsung/Health Connect y algunos conectores de wearables requieren validación física adicional. Apple Health, Oura y otras fuentes se normalizan cuando están disponibles; el sistema no debe inventar mediciones ausentes.

El próximo desarrollo debe priorizar calidad de captura y curación antes de añadir más análisis: una historia con relato humano y evidencia bien adoptada mejora todos los productos posteriores.

## Criterio de éxito

El ecosistema funciona cuando una persona puede capturar sin fricción, reconocer y adoptar sus piezas después, formar una historia fiel, reorganizarla sin pérdida, verla reflejada en reportes/publicaciones/mapa y, si lo desea, curarla en Obsidian sin crear duplicados ni bases paralelas.
