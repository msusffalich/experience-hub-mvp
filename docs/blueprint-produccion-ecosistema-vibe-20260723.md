# Blueprint de producción del ecosistema Vibe 1.0

Estado: referencia integral de producto, operación y evolución
Fecha: 2026-07-23
Alcance: Vibeapp, VibePWA, API Vibe, Supabase, Obsidian, Claude PC y VibePub.

## 1. Resumen ejecutivo

Vibe es una plataforma de inteligencia de experiencias humanas. Ayuda a una persona a registrar momentos de su vida, convertirlos en historias fieles, comprender los patrones que aparecen con el tiempo y producir recuerdos, reportes o publicaciones a partir de datos que le pertenecen.

La versión 1.0 no se define por una sola pantalla ni por una sola tecnología. Es un ecosistema con dos ritmos: **capturar en el momento** y **dar sentido después**. Vibeapp acompaña el momento con una captura ligera desde móvil o tableta. VibePWA permite revisar, ordenar, editar, analizar y compartir desde cualquier navegador. Ambos trabajan sobre la misma cuenta y la misma fuente de verdad en la nube.

El sistema no confunde una fotografía, una señal de salud o una noticia con una historia. Conserva cada pieza como evidencia o contexto hasta que el usuario decide incorporarla a una experiencia. Esta separación protege la memoria: evita historias falsas, conserva los archivos originales y permite reconstruir un episodio cuando ya existe perspectiva suficiente.

## 2. Historia y propósito del ecosistema

### 2.1 El propósito original

El proyecto nació para responder una pregunta humana, no técnica: **¿cómo registrar, recordar y comprender una vida sin reducirla a archivos sueltos ni a métricas aisladas?**

La propuesta original reunió cuatro elementos:

- experiencias relatadas por la propia persona;
- evidencia multimodal: texto, voz, imágenes, videos y documentos;
- contexto: salud, ubicación, clima, agenda y entorno;
- salidas útiles: memoria, reportes, hallazgos, publicaciones y aprendizaje.

### 2.2 La evolución que llevó a Vibe 1.0

La primera capa fue VibePWA: una aplicación web para registrar experiencias, administrar una biblioteca, consultar contexto y generar documentos. Después se incorporó Vibeapp, una aplicación nativa Flutter, porque una PWA no puede controlar de manera completa las capacidades de cámara, audio, sensores, permisos y conectores de un teléfono o wearable.

La exploración del mapa de conocimiento con Obsidian permitió detectar una decisión central: la evidencia suele aparecer antes que la historia. Por eso la versión 1.0 distingue explícitamente captura, adopción y curación. El resultado no reemplaza el propósito original; lo recupera y lo hace más sólido.

### 2.3 La promesa de producto

Vibe busca que una persona pueda:

1. guardar un hecho en pocos segundos;
2. encontrarlo más tarde por fecha, persona, lugar o tema;
3. convertir varias piezas en una historia coherente;
4. ver contexto sin confundirlo con lo vivido;
5. obtener una lectura clara de sus experiencias;
6. conservar una memoria exportable y bajo su control.

## 3. Para quién es Vibe

| Persona | Necesidad principal | Superficie más útil |
| --- | --- | --- |
| Quien está viviendo el momento | Capturar sin interrumpirse. | Vibeapp. |
| Quien organiza su memoria | Crear historias, elegir evidencia y revisar detalles. | VibePWA. |
| Quien busca comprensión | Consultar reportes, hallazgos y tendencias. | VibePWA. |
| Quien quiere compartir un recuerdo o informe | Generar un PDF cronológico, editable posteriormente. | VibePWA + VibePub. |
| Quien cultiva una base de conocimiento personal | Relacionar experiencias y escribir aprendizajes. | Obsidian + Claude PC. |
| Quien mantiene el servicio | Respaldar, recuperar y revisar controles. | VibePWA, zona Operación. |

Una misma persona puede usar todos estos roles. Los grupos o personas privadas permiten separar contextos como familia, viaje, proyecto o equipo sin abrir los datos a otros usuarios.

## 4. Componentes y responsabilidades

### 4.1 Vibeapp: el cuaderno de bolsillo

Vibeapp es la aplicación nativa Flutter para iPhone, iPad y, según disponibilidad física de equipos, Android y tabletas Android. Su misión principal es capturar, no obligar a estructurar una historia completa en el instante.

Capacidades principales:

- texto y narración por voz;
- fotos, videos, audio, documentos y selección desde galería;
- ubicación con permiso explícito;
- importación de archivos de salud y conectores nativos disponibles;
- cola local, reintentos y sincronización con la cuenta;
- comando de voz V dentro de la aplicación activa.

Vibeapp puede crear una experiencia simple cuando la persona ya quiere relatarla. No es el espacio para reorganizaciones complejas, administración de cuentas ni curación prolongada.

### 4.2 VibePWA: el estudio de memoria

VibePWA es la aplicación web multidispositivo. Es el lugar para transformar capturas en historias, profundizar en los datos y producir salidas legibles.

Capacidades principales:

- bandeja de evidencia por fecha, rango temporal y grupo/persona;
- biblioteca de experiencias, eventos, activos y agenda;
- creación y edición de historias;
- curación: mover evidencia, liberarla, fusionar, dividir, promover y degradar;
- mapa de experiencias, reportes, hallazgos, publicaciones y exportación Markdown;
- administración de grupos, datos, respaldos y operación;
- manual integrado en español, inglés, francés y portugués.

La interfaz de Historias separa lectura y curación. La tarjeta muestra primero
la portada, el relato y sus piezas; procedencia, línea de tiempo y borrado son
secundarios. Reorganizar no presenta seis herramientas simultáneas: la persona
elige mover archivos, unir, dividir o cambiar el nivel historia/evento, y la
aplicación abre una sola operación guiada. En móvil, los filtros permanecen
plegados hasta que la persona los solicita.

### 4.3 API Vibe y Supabase: el registro común

La API Node y Supabase forman la fuente única de verdad. Toda experiencia, evento, activo y señal de contexto se guarda una sola vez en el registro común, sin importar si fue creada desde Vibeapp o VibePWA.

Supabase aporta autenticación, Postgres, reglas de acceso por usuario, almacenamiento privado multimedia y actualizaciones de datos. Railway ejecuta la API, las automatizaciones y ReportLab para PDFs editados.

### 4.4 Obsidian y Claude PC: memoria curada

Obsidian recibe una exportación seleccionada de la base, no una segunda base de datos. Allí se cultivan vínculos, aprendizajes y mapas de conocimiento. Claude PC revisa la bóveda, audita consistencia y ayuda a proponer curación; no sustituye al registro canónico de Vibe.

### 4.5 VibePub: acabado editorial posterior

VibePWA crea un PDF editorial cronológico con historia y evidencia seleccionada. VibePub es la herramienta complementaria para refinar composición, estilo y distribución a canales externos. Publicar no altera la historia de origen.

## 5. Arquitectura e infraestructura

La arquitectura está diseñada para que cada capa haga lo que mejor sabe hacer:

| Capa | Tecnología o servicio | Responsabilidad |
| --- | --- | --- |
| Captura nativa | Flutter, iOS/iPadOS, Android futuro | Cámara, audio, video, archivos, permisos, cola local y conectores. |
| Aplicación web | VibePWA | Curación, análisis, reportes, publicaciones y operación. |
| API | Node.js en Railway | Validación, sincronización, integraciones, automatizaciones y PDFs. |
| Datos | Supabase Auth, Postgres, RLS, Storage | Identidad, datos privados, multimedia y auditoría. |
| Documentos | ReportLab | PDFs de reportes, hallazgos, publicaciones y manuales. |
| Conocimiento | Obsidian local + Claude PC | Mapa de conocimiento, aprendizaje y curación humana. |
| Edición posterior | VibePub | Diseño y adaptación externa de publicaciones. |

La infraestructura separa lo inmediato de lo pesado. Guardar una captura debe responder pronto. Enriquecimientos como clima, noticias, análisis de entorno o lecturas derivadas se ejecutan después, con registro de resultado, reintento o acción requerida.

## 6. Modelo de datos: persona, historia y evidencia

```
Cuenta autenticada
  -> Grupo o persona privada opcional
     -> Experiencia: episodio con rango de tiempo y sentido
        -> Evento opcional: submomento significativo
        -> Evidencia intencional: foto, audio, video, texto, documento
        -> Referencias a contexto: salud, GPS, clima, noticias, agenda
```

### 6.1 Definiciones operativas

- **Persona o grupo:** ámbito privado que identifica a quién pertenece el registro.
- **Experiencia:** un episodio vivido que se sostiene como historia, por ejemplo una tarde en la playa o una reunión importante.
- **Evento:** un momento dentro de una experiencia, como una conversación, una decisión o un cambio relevante.
- **Evidencia intencional:** algo capturado o elegido deliberadamente: foto, video, voz, texto o documento.
- **Contexto ambiente:** datos temporales que enriquecen la lectura: biometría, ubicación, clima, noticias y agenda.
- **Artefacto:** una producción o fuente, como un informe, paper o documento. Puede adjuntarse, pero no es automáticamente una historia.

## 7. Contrato de narrativa y clasificación

La narrativa humana es **lenguaje de una persona que cuenta qué vivió**. El formato no define la narrativa; su origen sí.

| Caso | Destino | Estado de narrativa |
| --- | --- | --- |
| Texto de la persona relatando un momento | Experiencia o evento | Narrada. |
| Voz transcrita relatando un momento | Experiencia o evento | Narrada. |
| Video con voz que relata el momento | Experiencia o evento + activo | Narrada por la transcripción. |
| Foto, video silencioso, OCR o descripción IA | Activo/evidencia | Pendiente de relato. |
| Pulso, sueño, pasos, GPS, clima o noticias | Contexto temporal | No crea experiencia. |
| Paper, informe o fuente reunida | Artefacto o activo | No es narrativa por sí solo. |
| Nombre de archivo, etiqueta o texto de relleno | Candidato a revisar | No es narrativa. |

Una experiencia se considera narrada si tiene relato propio o si al menos uno de sus eventos contiene relato humano. Este rollup impide que una historia con eventos bien narrados parezca vacía.

### 7.1 Actividad, estado y lugar no son lo mismo

Las categorías de actividad que suelen originar experiencias incluyen Trabajo, Paseo/Viaje, Aprendizaje, Social, Entretenimiento, Creatividad y Espiritualidad. Salud puede ser una experiencia cuando hay un episodio vivido, como una consulta médica; una métrica de salud sigue siendo contexto.

Bienestar es una dimensión o estado, no una actividad. Hogar es un lugar, no una categoría de experiencia. Compras solo se vuelve historia cuando existe una vivencia que vale relatar, no como un simple registro rutinario.

## 8. Procesos E2E del ecosistema

### 8.1 Captura rápida desde móvil

1. La persona selecciona su grupo o usa su cuenta principal en Vibeapp.
2. Captura texto, voz, foto, video, documento, ubicación o una señal disponible.
3. Vibeapp guarda en una cola local si la red no está lista.
4. La API valida identidad e idempotencia, y Supabase guarda el dato o activo privado.
5. La captura queda sincronizada o muestra una acción clara de reintento.
6. La evidencia sin historia aparece en la Bandeja de VibePWA.

### 8.2 Construcción de una historia

1. En VibePWA, el usuario abre Nueva experiencia.
2. Elige una fecha o rango para reconocer sus piezas recientes.
3. Escribe o dicta qué ocurrió. Esta es la narrativa.
4. Selecciona fotos, audios, videos, documentos o textos de la bandeja.
5. Guarda la experiencia; los activos elegidos se adoptan y quedan vinculados.
6. El contexto de esa ventana temporal queda disponible como referencia, sin convertirse en historia falsa.

### 8.3 Curación posterior

El usuario puede editar cuando ya tiene perspectiva. Puede liberar una evidencia, pasarla a otra historia, fusionar historias del mismo episodio, dividir una historia larga, promover un evento a experiencia o degradar una experiencia menor a evento. El sistema conserva antecedentes y no destruye de forma silenciosa.

### 8.4 Lectura, reportes y hallazgos

Reportes, Hallazgos y Publicaciones consumen la misma base de experiencias. Un filtro por fecha, grupo/persona, categoría o experiencia delimita el alcance. Los resultados muestran evidencia y contexto solo cuando existen. No presentan energía, sueño, categoría ni conclusiones clínicas como si fueran datos seguros cuando no hay base suficiente.

### 8.5 Publicación editorial

El usuario define el alcance y el tipo de publicación. Vibe ordena cronológicamente las experiencias y evidencia elegida, desarrolla una narrativa editorial fiel a los hechos y genera un PDF. Cuando existen videos, el paquete editorial puede incluir el PDF y los videos relacionados para descargar y editar con VibePub u otra herramienta.

### 8.6 Mapa de conocimiento con Obsidian

VibePWA exporta experiencias narradas a una bóveda local configurada. El export valida que la ruta sea una bóveda real, genera notas y mapa en un lote, conserva la zona humana de las notas y no borra automáticamente memorias curadas. Obsidian sirve para profundizar aprendizajes y relaciones, no para competir con la base de datos.

## 9. Integraciones de dispositivos y fuentes

### 9.1 Teléfonos, tabletas y salud

Vibeapp utiliza capacidades nativas permitidas por cada plataforma. En Apple puede trabajar con cámara, micrófono, archivos, ubicación y HealthKit cuando el usuario concede permisos. En Android, la estrategia contempla cámara, archivos y Health Connect; la validación física se completa por dispositivo disponible.

Oura Ring puede aportar sueño, actividad, frecuencia cardíaca, recuperación y otros indicadores mediante API OAuth o archivo de respaldo. Los datos sin lectura se guardan como ausencia de datos, nunca como cero. Samsung Watch y Health Connect forman parte de la matriz de integración y requieren prueba física específica antes de declararse validados.

### 9.2 Lentes Meta Ray-Ban y Oakley

Los lentes Meta capturan fotos y videos, pero su flujo oficial utiliza el teléfono como puente. El contenido se importa primero en la aplicación Meta AI y luego pasa a Fotos/Galería del dispositivo. Vibeapp puede capturarlo desde la galería o archivos del teléfono como evidencia intencional.

- Fotos: formatos normales como JPEG o HEIC según la plataforma.
- Videos: formatos habituales como MP4 o HEVC; incluyen su audio cuando existe.
- Audio de interacciones Meta AI: se gestiona mediante las herramientas de descarga de información de Meta, no como una grabadora universal de los lentes.
- Autocapture: puede crear compilaciones dentro de Meta AI; Vibe recibe los archivos que el usuario importe al teléfono.

Vibe no promete controlar los lentes, extraer automáticamente su almacenamiento ni convertir sus exportaciones HTML/JSON en multimedia. La evidencia entra cuando existe un archivo accesible en el dispositivo y el usuario lo autoriza.

### 9.3 Clima, noticias, agenda y entretenimiento

Vibeapp captura ubicación y señales del momento; la API enriquece la experiencia por fecha, hora y lugar. Clima, noticias y agenda son contexto, no hechos narrados. La cartelera y entretenimiento requieren fuentes vigentes por ciudad y deben comunicar claramente el nivel de disponibilidad.

## 10. Idiomas, privacidad y accesibilidad

Vibe se presenta en cuatro idiomas completos: español, inglés, francés y portugués. Las etiquetas, mensajes de estado, manuales y flujos clave deben mantener paridad; una pantalla parcialmente traducida es un defecto de producto.

Cada usuario ve su propia información. Los grupos o personas son subámbitos privados dentro de esa cuenta, no usuarios globales. El acceso a una cuenta está determinado por autenticación y autorización del servidor; Vibeapp y VibePWA usan la misma sesión y las mismas reglas de datos.

Las acciones de cámara, audio, ubicación, salud y archivos se solicitan solo cuando la persona elige utilizarlas. Los medios viven en almacenamiento privado y se muestran por enlaces firmados temporales. Respaldos, baja de datos y controles técnicos se concentran en Operación para no contaminar los flujos cotidianos.

## 11. Resiliencia, calidad y operación

La experiencia no debe depender de una red perfecta. Vibeapp conserva una cola local y reintenta; la API usa identificadores para evitar duplicados; VibePWA informa el estado real en vez de prometer sincronización inexistente.

Antes de publicar cambios se validan sintaxis, flujos de servidor, contrato de Vibeapp, activos, exportación Obsidian y PDFs. Después del deploy se prueban los permisos, dispositivos e integraciones que no pueden simularse completamente.

| Responsable | Ámbito |
| --- | --- |
| Miguel | Decisiones de producto, validación humana y coordinación. |
| Codex PC | VibePWA, API, servidor, documentación y despliegue. |
| Claude MAC | Vibeapp Flutter e integración nativa de dispositivos. |
| Claude PC | Obsidian, mapa de conocimiento y auditoría de bóveda. |

Todo handcheck debe declarar objetivo, versión, datos de prueba, resultado esperado, resultado observado y criterio de cierre. La coordinación evita que tres frentes editen la misma responsabilidad.

## 12. Estado de la versión 1.0 y siguientes mejoras

La versión 1.0 dispone de captura multimodal, sincronización, biblioteca, bandeja de evidencia, curación, contexto, reportes, hallazgos, publicaciones PDF, exportación Obsidian y una aplicación nativa operativa en el ecosistema Apple validado.

Mejoras posteriores:

- validación física completa en Android y Samsung Watch;
- conectores de salud con actualización continua bajo permisos del usuario;
- propuestas más inteligentes de agrupación por tiempo, lugar y evidencia;
- diseño editorial adicional para publicaciones y VibePub;
- indicadores de estado y recuperación cada vez más simples para el usuario final;
- verificación real de dividir y degradar una historia en todos los productos de salida.

## 13. Recomendaciones finales

1. Captura primero y narra cuando puedas; no fuerces una historia por cada archivo.
2. Usa Vibeapp para vivir y registrar; usa VibePWA para ordenar y comprender.
3. Trata el contexto como una ayuda para recordar, no como diagnóstico.
4. Antes de eliminar, libera, reorganiza o respalda: una memoria puede adquirir valor después.
5. Mantén Obsidian como una capa de conocimiento curada y Vibe como el registro confiable de origen.

## 14. Documentos de referencia

| Documento | Para qué sirve |
| --- | --- |
| Este blueprint | Historia, arquitectura, responsabilidades y operación de Vibe 1.0. |
| `docs/manual-usuario-vibe-20260723.md` | Orientación de uso cotidiano para personas usuarias. |
| `docs/capture-adoption-blueprint-20260721.md` | Especificación de captura, adopción y curación. |
| `docs/vibeapp-vibepwa-operating-contract.md` | Contrato técnico entre las aplicaciones y la API. |
| `docs/story-curation-operations-20260723.md` | Reglas de reorganización de historias. |
| `obsidian-vault-vibe/90_System/*` | Contrato de narrativa y conocimiento curado. |

Si un documento contradice este blueprint o el contrato de narrativa, se revisa antes de cambiar el producto.
