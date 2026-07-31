let locale = normalizeLocale(localStorage.getItem("vibe-next-language") || navigator.language);
let chapterObserver = null;

const copies = {
  es: {
    documentTitle: "Manual de usuario · VibePWA 2",
    eyebrow: "Guía integral de uso",
    title: "VibePWA 2",
    subtitle: "Una guía clara para capturar lo importante, convertirlo en historias y obtener reportes, hallazgos, publicaciones y conocimiento útil.",
    updated: "Edición de producto",
    languages: "ES · EN · FR · PT",
    audience: "Uso personal y por grupos",
    language: "Idioma",
    print: "Imprimir o guardar PDF",
    back: "Volver a Vibe",
    search: "Buscar en el manual",
    searchPlaceholder: "Ejemplo: Oura, videos, sincronización...",
    contents: "Contenido",
    noResults: "No encontramos un capítulo con esas palabras. Prueba con un término más corto.",
    chapter: "Capítulo",
    footer: "VibePWA 2 · Manual de usuario y operación",
    quick: {
      title: "La ruta más simple",
      steps: [
        ["Captura", "Vibeapp guarda el hecho en el momento."],
        ["Revisa", "VibePWA muestra la evidencia de forma visual."],
        ["Cuenta", "Arma una historia cuando quieras darle sentido."],
        ["Explota", "Genera análisis, publicaciones o conocimiento."],
      ],
    },
    chapters: [
      {
        id: "ecosistema",
        title: "El ecosistema Vibe",
        lead: "Vibe reúne varios componentes con funciones diferentes, pero todos trabajan sobre la misma cuenta y la misma información.",
        sections: [
          {
            title: "Quién hace qué",
            paragraphs: [
              "Vibeapp acompaña al teléfono o tableta y se encarga de la captura inmediata. VibePWA 2 organiza esa evidencia, crea historias y genera resultados. El servidor Vibe sincroniza y protege los datos.",
              "Obsidian recibe una copia organizada para curación y aprendizaje. Vibepub o MagStudio pueden utilizarse después para una edición editorial más avanzada.",
            ],
            steps: [
              "Vibeapp: texto, voz, fotos, videos, documentos, ubicación y salud.",
              "VibePWA 2: historias, evidencia, reportes, hallazgos, publicaciones y cuenta.",
              "Obsidian: mapa derivado y notas de conocimiento.",
              "Vibepub: edición final para otros canales.",
            ],
            note: "Supabase y el servidor Vibe son la fuente principal. Obsidian no reemplaza el almacenamiento de Vibe.",
          },
          {
            title: "Qué puede conservar",
            paragraphs: [
              "Vibe combina lo que cuentas con lo que capturan tus dispositivos. Una foto, un audio, una medición o una ubicación pueden pertenecer al mismo momento sin perder su formato original.",
            ],
          },
        ],
      },
      {
        id: "captura-historias",
        title: "Capturar no es lo mismo que contar una historia",
        lead: "Los hechos suelen registrarse en el momento. La historia puede construirse más tarde, cuando ya sabes qué quieres recordar.",
        sections: [
          {
            title: "Captura rápida",
            paragraphs: [
              "Usa Vibeapp para guardar una nota, hablar, tomar una foto, grabar un video o incorporar un documento. No tienes que decidir en ese instante a qué experiencia pertenece.",
              "La evidencia queda segura y aparece después en VibePWA 2 como contenido por organizar.",
            ],
          },
          {
            title: "Crear una historia",
            steps: [
              "Abre Historias y elige Nueva historia.",
              "Escribe un título breve y cuenta qué ocurrió con tus palabras.",
              "Confirma fecha, persona o grupo y área de vida.",
              "Selecciona visualmente la evidencia que pertenece al relato.",
              "Añade eventos opcionales si hubo submomentos importantes.",
              "Guarda la historia.",
            ],
            note: "Narrativa es tu lenguaje contando lo vivido. OCR, visión automática, biometría y clima aportan contexto, pero no reemplazan tu relato.",
          },
          {
            title: "Editar y reorganizar",
            paragraphs: [
              "Puedes cambiar el relato, añadir o quitar archivos, unir historias, dividir una historia o convertir un evento en una historia propia. Quitar un archivo de una historia no borra el original.",
            ],
          },
        ],
      },
      {
        id: "multimodalidad",
        title: "Evidencia multimodal",
        lead: "La galería presenta cada tipo de contenido de una forma reconocible para que puedas elegir sin leer nombres técnicos.",
        sections: [
          {
            title: "Cómo se presenta",
            steps: [
              "Imágenes: miniatura y fecha.",
              "Videos: miniatura, duración y reproducción.",
              "Audios: controles de escucha y transcripción cuando exista.",
              "Textos: extracto legible.",
              "Documentos: icono, nombre y resumen disponible.",
              "Biometría y contexto: métricas claras con su fuente y hora.",
            ],
          },
          {
            title: "Estados sencillos",
            paragraphs: [
              "Por organizar significa que el contenido está guardado pero aún no pertenece a una historia. Vinculada significa que ya forma parte de una. Requiere atención indica que el original se conserva, pero necesita revisión.",
            ],
            note: "Una evidencia suelta sigue disponible para reportes, hallazgos y publicaciones. No es obligatorio convertir todo en historia.",
          },
          {
            title: "Lentes Meta y otros dispositivos",
            paragraphs: [
              "Las fotos y videos de Ray-Ban Meta u Oakley Meta se importan primero con la app Meta AI al teléfono. Desde la galería del iPhone, iPad o Android, Vibeapp los envía como evidencia normal; no se espera un archivo CSV.",
              "Vibeapp funciona como puerta de captura en teléfonos y tabletas. Los relojes y anillos aportan mediciones mediante Apple Health, Health Connect u Oura, según el dispositivo y los permisos concedidos.",
            ],
          },
        ],
      },
      {
        id: "grupos-agenda",
        title: "Grupos, personas y agenda",
        lead: "La cuenta pertenece al usuario. Los grupos o personas permiten separar información sin mezclar propietarios.",
        sections: [
          {
            title: "Usar grupos o personas",
            steps: [
              "Crea el grupo o persona desde Cuenta.",
              "Selecciona para quién estás capturando.",
              "Vibeapp conserva esa selección en las capturas siguientes.",
              "VibePWA permite filtrar historias y resultados por esa persona o grupo.",
            ],
            note: "Desactivar un grupo impide usarlo en nuevas capturas, pero conserva sus historias y archivos anteriores.",
          },
          {
            title: "Agenda",
            paragraphs: [
              "La agenda registra lo que está previsto. Una cita no se convierte automáticamente en experiencia. Después del evento, puedes crear una historia y usar la cita como contexto.",
              "La agenda puede ayudar a ubicar el momento, las personas y el lugar sin inventar un relato que el usuario no haya contado.",
            ],
          },
        ],
      },
      {
        id: "salud-contexto",
        title: "Salud, ubicación y contexto automático",
        lead: "El contexto ayuda a comprender un momento, pero no lo convierte por sí solo en una experiencia.",
        sections: [
          {
            title: "Apple Health y HealthKit",
            paragraphs: [
              "La lectura normal de Apple Health ocurre en Vibeapp mediante HealthKit y los permisos concedidos en el iPhone. VibePWA ofrece importación manual únicamente para respaldo, históricos o recuperación.",
              "Pasos, pulso, sueño y energía activa se muestran cuando existen. Si una lectura falta, Vibe indica que no hay dato suficiente y no usa cero.",
            ],
          },
          {
            title: "Android, Samsung y Health Connect",
            paragraphs: [
              "En Android, Vibeapp obtiene los datos autorizados mediante Health Connect. Esta es también la vía preferida para relojes Samsung Galaxy compatibles.",
              "La disponibilidad depende del modelo, la versión del sistema y los permisos del usuario. Vibe muestra únicamente las mediciones que realmente recibió.",
            ],
          },
          {
            title: "Oura",
            steps: [
              "Abre Cuenta y busca Integraciones.",
              "Selecciona Conectar Oura.",
              "Autoriza las categorías deseadas en la página oficial de Oura.",
              "Regresa a Vibe y revisa la última sincronización.",
            ],
            note: "Oura aporta sueño, actividad, recuperación y otras métricas autorizadas. Esas mediciones son contexto, no historias independientes.",
          },
          {
            title: "Ubicación, clima, noticias y cartelera",
            paragraphs: [
              "Cuando el usuario lo permite, Vibeapp aporta la ubicación del momento. Vibe utiliza esa referencia para actualizar automáticamente clima, noticias y entretenimiento vigente, como cine, teatro, conciertos y eventos de la ciudad.",
              "Las fuentes y fechas deben ser visibles. Una actualización atrasada o fallida se muestra como pendiente; no se presenta información antigua como actual.",
            ],
          },
        ],
      },
      {
        id: "inteligencia",
        title: "Reportes y hallazgos",
        lead: "Inteligencia transforma hechos y mediciones en una lectura comprensible sin confundir datos con narración.",
        sections: [
          {
            title: "Definir el alcance",
            steps: [
              "Elige el período.",
              "Elige persona o grupo.",
              "Selecciona un área de vida si deseas acotar.",
              "Decide si usarás todo lo registrado, historias o evidencia.",
              "Genera el resultado.",
            ],
          },
          {
            title: "Reporte",
            paragraphs: [
              "El reporte ordena actividad, mediciones, cobertura por áreas y evolución. Incluye las métricas biométricas disponibles y aclara lo que falta.",
            ],
          },
          {
            title: "Hallazgos",
            paragraphs: [
              "Los hallazgos separan la observación comprobable de la interpretación. También indican el nivel de confianza y proponen una siguiente acción con lenguaje humano.",
            ],
            note: "Área de vida es el término único para clasificar actividad en reportes y hallazgos. Bienestar es un estado y Hogar es un lugar.",
          },
        ],
      },
      {
        id: "publicar",
        title: "Publicaciones, PDF y videos",
        lead: "Publicar combina historias y evidencia para preparar un documento cronológico que puede editarse después en otra herramienta.",
        sections: [
          {
            title: "Crear una publicación",
            steps: [
              "Define período y persona o grupo.",
              "Elige las historias y evidencia que deseas incluir.",
              "Revisa el orden y el título.",
              "Genera la publicación.",
            ],
          },
          {
            title: "Qué se descarga",
            paragraphs: [
              "Si no hay videos, Vibe genera un PDF. Cuando existen videos seleccionados, genera un paquete ZIP con el PDF y los archivos de video relacionados.",
              "Las imágenes se incorporan al PDF con orientación correcta. Audios, documentos y mediciones se mencionan de forma comprensible y mantienen su referencia.",
            ],
            note: "Vibe no debe inventar hechos. Organiza y edita el material disponible respetando lo que realmente ocurrió.",
          },
        ],
      },
      {
        id: "obsidian",
        title: "Mapa de experiencias y Obsidian",
        lead: "Obsidian permite explorar relaciones, aprendizajes y tendencias a partir de historias ya confirmadas.",
        sections: [
          {
            title: "Dónde encontrarlo",
            steps: [
              "Abre la pestaña Mapa en la navegación principal de VibePWA.",
              "Revisa personas, historias, evidencia y el estado de la vista estructurada.",
              "Pulsa Actualizar mapa para comprobar la vista o Enviar a Obsidian para escribirla en la bóveda configurada.",
            ],
          },
          {
            title: "Qué se exporta",
            paragraphs: [
              "Vibe envía notas de experiencias, eventos relevantes y referencias a activos. Biometría, ubicación y clima enriquecen las notas por tiempo, pero no se convierten en experiencias separadas.",
            ],
          },
          {
            title: "Curaduría protegida",
            paragraphs: [
              "La zona automática puede regenerarse. La zona de curaduría humana se conserva para que tus aprendizajes y comentarios no desaparezcan en una nueva exportación.",
              "La bóveda es una herramienta de conocimiento derivado. Los cambios importantes de historias deben realizarse en VibePWA.",
            ],
          },
        ],
      },
      {
        id: "privacidad-sync",
        title: "Privacidad, trabajo offline y sincronización",
        lead: "El usuario debe saber si algo está guardado, pendiente o requiere atención, sin interpretar mensajes técnicos.",
        sections: [
          {
            title: "Privacidad",
            paragraphs: [
              "Cada usuario ve únicamente su cuenta y sus grupos autorizados. Los archivos se guardan de forma privada y las descargas usan enlaces temporales.",
              "Los permisos de salud, ubicación, cámara y micrófono se solicitan por función y pueden revocarse desde el dispositivo.",
            ],
          },
          {
            title: "Sin conexión",
            paragraphs: [
              "Vibeapp conserva el archivo en el dispositivo cuando no hay señal. Al recuperar conexión, continúa el envío con la hora original y sin crear duplicados.",
            ],
          },
          {
            title: "Estados de sincronización",
            steps: [
              "Guardado: el servidor confirmó contenido y registro.",
              "Enviando: la transferencia continúa.",
              "Se enviará después: permanece en la cola local.",
              "Reintentando: hubo una falla temporal.",
              "Requiere atención: el original está protegido, pero necesita revisión.",
            ],
          },
        ],
      },
      {
        id: "cuenta-idiomas",
        title: "Cuenta, idiomas y apariencia",
        lead: "Las preferencias personales no cambian ni eliminan la información guardada.",
        sections: [
          {
            title: "Preferencias",
            paragraphs: [
              "Desde Cuenta puedes seleccionar español, inglés, francés o portugués y elegir pantalla clara u oscura. Todas las funciones y mensajes deben aparecer en el idioma elegido.",
            ],
          },
          {
            title: "Uso normal y operación",
            paragraphs: [
              "El uso cotidiano se concentra en Inicio, Historias, Evidencia, Inteligencia y Publicar. Los detalles técnicos, respaldos y diagnósticos permanecen separados en Operación.",
            ],
          },
        ],
      },
      {
        id: "solucion-problemas",
        title: "Solución de problemas",
        lead: "Antes de repetir una captura o borrar información, identifica el estado que muestra Vibe.",
        sections: [
          {
            title: "No veo una captura",
            steps: [
              "Revisa Estado en Vibeapp.",
              "Confirma si está guardada, enviando o pendiente.",
              "En VibePWA abre Evidencia y actualiza la bandeja.",
              "Quita filtros de fecha, tipo y persona.",
              "Si aparece Requiere atención, abre el detalle y conserva el archivo.",
            ],
          },
          {
            title: "No veo métricas o contexto",
            steps: [
              "Confirma permisos del dispositivo.",
              "Revisa que la fecha y la persona sean correctas.",
              "Comprueba la última sincronización de Oura o salud.",
              "Recuerda que una lectura ausente se muestra como insuficiente.",
            ],
          },
          {
            title: "El PDF no se genera",
            steps: [
              "Mantén la sesión abierta.",
              "Reduce el período solo para identificar el contenido problemático.",
              "Revisa que los archivos seleccionados estén disponibles.",
              "Abre Operación y anota la versión y el mensaje mostrado.",
            ],
          },
          {
            title: "La aplicación parece desactualizada",
            paragraphs: [
              "Usa Actualizar aplicación desde Cuenta. Esta acción renueva la interfaz y no borra historias ni archivos.",
            ],
          },
        ],
      },
      {
        id: "operacion",
        title: "Operación y diagnóstico",
        lead: "Esta sección está destinada a soporte y administración. No es necesaria para capturar, organizar o publicar.",
        operation: true,
        sections: [
          {
            title: "Qué revisar",
            steps: [
              "Versión de VibePWA 2 y del contrato.",
              "Disponibilidad del servicio.",
              "Conexión con la base de datos y archivos.",
              "Capturas o trabajos pendientes.",
              "Último error y etapa confirmada.",
              "Estado de Oura y otras integraciones.",
            ],
          },
          {
            title: "Qué significa un servicio verde",
            paragraphs: [
              "Un servidor encendido no garantiza que pueda guardar archivos. La operación completa debe confirmar servicio, base de datos, almacenamiento y una captura autenticada.",
            ],
            note: "No compartas contraseñas, tokens, claves de Supabase ni secretos de integraciones en capturas de pantalla o notas de soporte.",
          },
          {
            title: "Cuándo pedir soporte",
            paragraphs: [
              "Solicita soporte cuando un elemento permanece en Requiere atención, el mismo error reaparece después de actualizar o los conteos no coinciden entre dispositivos.",
              "Incluye fecha, versión, tipo de contenido y mensaje visible. No vuelvas a enviar muchas copias del mismo archivo.",
            ],
          },
        ],
      },
    ],
  },
  en: {
    documentTitle: "User manual · VibePWA 2",
    eyebrow: "Complete user guide",
    title: "VibePWA 2",
    subtitle: "A clear guide to capture what matters, turn it into stories, and produce useful reports, findings, publications, and knowledge.",
    updated: "Product edition",
    languages: "ES · EN · FR · PT",
    audience: "Personal and group use",
    language: "Language",
    print: "Print or save PDF",
    back: "Back to Vibe",
    search: "Search the manual",
    searchPlaceholder: "Example: Oura, videos, synchronization...",
    contents: "Contents",
    noResults: "No chapter matches those words. Try a shorter term.",
    chapter: "Chapter",
    footer: "VibePWA 2 · User and operations manual",
    quick: {
      title: "The simplest path",
      steps: [
        ["Capture", "Vibeapp saves the fact when it happens."],
        ["Review", "VibePWA presents the evidence visually."],
        ["Tell", "Build a story when you are ready to give it meaning."],
        ["Use", "Create analysis, publications, or knowledge."],
      ],
    },
    chapters: [
      {
        id: "ecosistema",
        title: "The Vibe ecosystem",
        lead: "Vibe brings together several components with different roles, all working with the same account and information.",
        sections: [
          {
            title: "Who does what",
            paragraphs: [
              "Vibeapp travels with the phone or tablet and handles immediate capture. VibePWA 2 organizes the evidence, builds stories, and creates results. The Vibe server synchronizes and protects the data.",
              "Obsidian receives an organized copy for curation and learning. Vibepub or MagStudio may be used later for advanced editorial work.",
            ],
            steps: [
              "Vibeapp: text, voice, photos, videos, documents, location, and health.",
              "VibePWA 2: stories, evidence, reports, findings, publications, and account.",
              "Obsidian: derived map and knowledge notes.",
              "Vibepub: final editing for other channels.",
            ],
            note: "Supabase and the Vibe server are the primary source. Obsidian does not replace Vibe storage.",
          },
          {
            title: "What it can preserve",
            paragraphs: [
              "Vibe combines what you tell with what your devices capture. A photo, audio file, measurement, or location can belong to the same moment without losing its original format.",
            ],
          },
        ],
      },
      {
        id: "captura-historias",
        title: "Capturing is not the same as telling a story",
        lead: "Facts are usually recorded in the moment. A story can be built later, when you know what you want to remember.",
        sections: [
          {
            title: "Quick capture",
            paragraphs: [
              "Use Vibeapp to save a note, speak, take a photo, record video, or add a document. You do not have to decide which experience it belongs to right away.",
              "The evidence remains safe and later appears in VibePWA 2 as content to organize.",
            ],
          },
          {
            title: "Create a story",
            steps: [
              "Open Stories and choose New story.",
              "Write a short title and describe what happened in your own words.",
              "Confirm date, person or group, and life area.",
              "Visually select the evidence that belongs to the story.",
              "Add optional events when important sub-moments occurred.",
              "Save the story.",
            ],
            note: "Narrative is your language describing what you lived. OCR, automated vision, biometrics, and weather add context but do not replace your account.",
          },
          {
            title: "Edit and reorganize",
            paragraphs: [
              "You may change the narrative, add or remove files, merge stories, split a story, or turn an event into its own story. Removing a file from a story does not delete the original.",
            ],
          },
        ],
      },
      {
        id: "multimodalidad",
        title: "Multimodal evidence",
        lead: "The gallery presents each content type in a recognizable way, so you can choose without reading technical filenames.",
        sections: [
          {
            title: "How content appears",
            steps: [
              "Images: thumbnail and date.",
              "Videos: thumbnail, duration, and playback.",
              "Audio: listening controls and transcript when available.",
              "Text: readable excerpt.",
              "Documents: icon, name, and available summary.",
              "Biometrics and context: clear metrics with source and time.",
            ],
          },
          {
            title: "Simple states",
            paragraphs: [
              "To organize means the content is stored but not yet part of a story. Linked means it already belongs to one. Needs attention means the original is preserved but requires review.",
            ],
            note: "Loose evidence remains available for reports, findings, and publications. Not everything must become a story.",
          },
          {
            title: "Meta glasses and other devices",
            paragraphs: [
              "Photos and videos from Ray-Ban Meta or Oakley Meta are first imported to the phone with the Meta AI app. From the iPhone, iPad, or Android gallery, Vibeapp sends them as normal evidence; no CSV file is expected.",
              "Vibeapp is the capture gateway on phones and tablets. Watches and rings provide measurements through Apple Health, Health Connect, or Oura, depending on the device and granted permissions.",
            ],
          },
        ],
      },
      {
        id: "grupos-agenda",
        title: "Groups, people, and agenda",
        lead: "The account belongs to the user. Groups or people separate information without mixing ownership.",
        sections: [
          {
            title: "Use groups or people",
            steps: [
              "Create the group or person from Account.",
              "Select who you are capturing for.",
              "Vibeapp keeps that choice for following captures.",
              "VibePWA filters stories and results by that person or group.",
            ],
            note: "Deactivating a group prevents new use but preserves its previous stories and files.",
          },
          {
            title: "Agenda",
            paragraphs: [
              "The agenda records what is planned. An appointment does not automatically become an experience. After it happens, you can create a story and use the appointment as context.",
              "The agenda can help identify time, people, and place without inventing a story the user never told.",
            ],
          },
        ],
      },
      {
        id: "salud-contexto",
        title: "Health, location, and automatic context",
        lead: "Context helps explain a moment but does not turn itself into an experience.",
        sections: [
          {
            title: "Apple Health and HealthKit",
            paragraphs: [
              "Normal Apple Health reading happens in Vibeapp through HealthKit and the permissions granted on the iPhone. VibePWA manual import is only for backup, history, or recovery.",
              "Steps, heart rate, sleep, and active energy appear when available. If a reading is missing, Vibe reports insufficient data and does not use zero.",
            ],
          },
          {
            title: "Android, Samsung, and Health Connect",
            paragraphs: [
              "On Android, Vibeapp reads authorized data through Health Connect. This is also the preferred path for compatible Samsung Galaxy watches.",
              "Availability depends on the model, system version, and user permissions. Vibe displays only measurements it actually received.",
            ],
          },
          {
            title: "Oura",
            steps: [
              "Open Account and find Integrations.",
              "Select Connect Oura.",
              "Authorize the desired categories on the official Oura page.",
              "Return to Vibe and review the last synchronization.",
            ],
            note: "Oura provides authorized sleep, activity, readiness, and other metrics. They are context, not separate stories.",
          },
          {
            title: "Location, weather, news, and local events",
            paragraphs: [
              "When permitted, Vibeapp provides the location of the moment. Vibe uses it to automatically update weather, news, and current entertainment such as movies, theater, concerts, and city events.",
              "Sources and dates must remain visible. A delayed or failed update appears as pending and is never presented as current.",
            ],
          },
        ],
      },
      {
        id: "inteligencia",
        title: "Reports and findings",
        lead: "Intelligence turns facts and measurements into a clear reading without confusing data with narrative.",
        sections: [
          {
            title: "Define scope",
            steps: [
              "Choose the period.",
              "Choose the person or group.",
              "Optionally select a life area.",
              "Choose all records, stories, or evidence.",
              "Generate the result.",
            ],
          },
          {
            title: "Report",
            paragraphs: [
              "A report organizes activity, measurements, life-area coverage, and change over time. It includes available biometric metrics and clearly states what is missing.",
            ],
          },
          {
            title: "Findings",
            paragraphs: [
              "Findings separate verified observations from interpretation. They also show confidence and suggest a next action in human language.",
            ],
            note: "Life area is the single term for activity classification in reports and findings. Well-being is a state and Home is a place.",
          },
        ],
      },
      {
        id: "publicar",
        title: "Publications, PDF, and videos",
        lead: "Publish combines stories and evidence into a chronological document that may be edited later in another tool.",
        sections: [
          {
            title: "Create a publication",
            steps: [
              "Define the period and person or group.",
              "Choose the stories and evidence to include.",
              "Review the order and title.",
              "Generate the publication.",
            ],
          },
          {
            title: "What is downloaded",
            paragraphs: [
              "Without videos, Vibe creates a PDF. With selected videos, it creates a ZIP package containing the PDF and related video files.",
              "Images appear in the PDF with correct orientation. Audio, documents, and measurements receive clear references.",
            ],
            note: "Vibe must not invent facts. It organizes and edits available material while respecting what actually happened.",
          },
        ],
      },
      {
        id: "obsidian",
        title: "Experience map and Obsidian",
        lead: "Obsidian explores relationships, lessons, and trends from confirmed stories.",
        sections: [
          {
            title: "Where to find it",
            steps: [
              "Open the Map tab in VibePWA's main navigation.",
              "Review people, stories, evidence, and the structured-view status.",
              "Select Refresh map to check the view or Send to Obsidian to write it to the configured vault.",
            ],
          },
          {
            title: "What is exported",
            paragraphs: [
              "Vibe sends experience notes, meaningful events, and asset references. Biometrics, location, and weather enrich notes by time but do not become separate experiences.",
            ],
          },
          {
            title: "Protected curation",
            paragraphs: [
              "The automatic area can be regenerated. The human curation area is preserved so your lessons and comments survive later exports.",
              "The vault is a derived knowledge tool. Important story changes should be made in VibePWA.",
            ],
          },
        ],
      },
      {
        id: "privacidad-sync",
        title: "Privacy, offline work, and synchronization",
        lead: "The user should know whether something is saved, pending, or needs attention without interpreting technical messages.",
        sections: [
          {
            title: "Privacy",
            paragraphs: [
              "Each user sees only their account and authorized groups. Files are stored privately and downloads use temporary links.",
              "Health, location, camera, and microphone permissions are requested by function and may be revoked on the device.",
            ],
          },
          {
            title: "Offline",
            paragraphs: [
              "Vibeapp keeps the file on the device when there is no signal. When the connection returns, it resumes with the original time and without creating duplicates.",
            ],
          },
          {
            title: "Synchronization states",
            steps: [
              "Saved: the server confirmed content and record.",
              "Sending: transfer is in progress.",
              "Will send later: it remains in the local queue.",
              "Retrying: a temporary failure occurred.",
              "Needs attention: the original is protected but requires review.",
            ],
          },
        ],
      },
      {
        id: "cuenta-idiomas",
        title: "Account, languages, and appearance",
        lead: "Personal preferences do not change or delete stored information.",
        sections: [
          {
            title: "Preferences",
            paragraphs: [
              "From Account, choose Spanish, English, French, or Portuguese and light or dark appearance. Every function and message should use the selected language.",
            ],
          },
          {
            title: "Normal use and operations",
            paragraphs: [
              "Daily use centers on Home, Stories, Evidence, Intelligence, and Publish. Technical details, backups, and diagnostics stay in Operations.",
            ],
          },
        ],
      },
      {
        id: "solucion-problemas",
        title: "Troubleshooting",
        lead: "Before repeating a capture or deleting information, identify the state shown by Vibe.",
        sections: [
          {
            title: "I cannot see a capture",
            steps: [
              "Review Status in Vibeapp.",
              "Check whether it is saved, sending, or pending.",
              "Open Evidence in VibePWA and refresh the inbox.",
              "Clear date, type, and person filters.",
              "If it needs attention, open details and keep the file.",
            ],
          },
          {
            title: "I cannot see metrics or context",
            steps: [
              "Confirm device permissions.",
              "Review date and person.",
              "Check the last Oura or health synchronization.",
              "Remember that missing readings appear as insufficient.",
            ],
          },
          {
            title: "The PDF is not generated",
            steps: [
              "Keep the session open.",
              "Shorten the period only to identify problematic content.",
              "Verify that selected files are available.",
              "Open Operations and note the version and visible message.",
            ],
          },
          {
            title: "The application looks outdated",
            paragraphs: [
              "Use Update application from Account. This refreshes the interface without deleting stories or files.",
            ],
          },
        ],
      },
      {
        id: "operacion",
        title: "Operations and diagnostics",
        lead: "This section is for support and administration. It is not required for capture, organization, or publishing.",
        operation: true,
        sections: [
          {
            title: "What to review",
            steps: [
              "VibePWA 2 and contract version.",
              "Service availability.",
              "Database and file connection.",
              "Pending captures or jobs.",
              "Last error and confirmed stage.",
              "Oura and other integration status.",
            ],
          },
          {
            title: "What a green service means",
            paragraphs: [
              "A running server does not guarantee that it can save files. Complete operation must confirm service, database, storage, and an authenticated capture.",
            ],
            note: "Do not share passwords, tokens, Supabase keys, or integration secrets in screenshots or support notes.",
          },
          {
            title: "When to request support",
            paragraphs: [
              "Request support when an item remains in Needs attention, the same error returns after updating, or counts differ between devices.",
              "Include date, version, content type, and visible message. Do not send many copies of the same file.",
            ],
          },
        ],
      },
    ],
  },
  fr: {
    documentTitle: "Manuel utilisateur · VibePWA 2",
    eyebrow: "Guide d'utilisation complet",
    title: "VibePWA 2",
    subtitle: "Un guide clair pour capturer l'essentiel, le transformer en histoires et produire des rapports, constats, publications et connaissances utiles.",
    updated: "Édition produit",
    languages: "ES · EN · FR · PT",
    audience: "Usage personnel et par groupes",
    language: "Langue",
    print: "Imprimer ou enregistrer en PDF",
    back: "Retour à Vibe",
    search: "Rechercher dans le manuel",
    searchPlaceholder: "Exemple : Oura, vidéos, synchronisation...",
    contents: "Sommaire",
    noResults: "Aucun chapitre ne correspond à ces mots. Essayez un terme plus court.",
    chapter: "Chapitre",
    footer: "VibePWA 2 · Manuel utilisateur et exploitation",
    quick: {
      title: "Le parcours le plus simple",
      steps: [
        ["Capturer", "Vibeapp enregistre le fait au moment où il se produit."],
        ["Réviser", "VibePWA présente les preuves visuellement."],
        ["Raconter", "Construisez une histoire quand vous souhaitez lui donner du sens."],
        ["Exploiter", "Créez analyses, publications ou connaissances."],
      ],
    },
    chapters: [
      {
        id: "ecosistema",
        title: "L'écosystème Vibe",
        lead: "Vibe réunit plusieurs composants aux rôles différents, tous reliés au même compte et aux mêmes informations.",
        sections: [
          {
            title: "Qui fait quoi",
            paragraphs: [
              "Vibeapp accompagne le téléphone ou la tablette et gère la capture immédiate. VibePWA 2 organise les preuves, construit les histoires et produit les résultats. Le serveur Vibe synchronise et protège les données.",
              "Obsidian reçoit une copie organisée pour la curation et l'apprentissage. Vibepub ou MagStudio peut ensuite servir à une édition avancée.",
            ],
            steps: [
              "Vibeapp : texte, voix, photos, vidéos, documents, lieu et santé.",
              "VibePWA 2 : histoires, preuves, rapports, constats, publications et compte.",
              "Obsidian : carte dérivée et notes de connaissance.",
              "Vibepub : édition finale pour d'autres canaux.",
            ],
            note: "Supabase et le serveur Vibe restent la source principale. Obsidian ne remplace pas le stockage Vibe.",
          },
          {
            title: "Ce que Vibe conserve",
            paragraphs: [
              "Vibe combine votre récit avec ce que vos appareils capturent. Une photo, un audio, une mesure ou un lieu peuvent appartenir au même moment tout en gardant leur format original.",
            ],
          },
        ],
      },
      {
        id: "captura-historias",
        title: "Capturer n'est pas raconter une histoire",
        lead: "Les faits sont souvent saisis sur le moment. L'histoire peut être construite plus tard, lorsque vous savez ce que vous voulez retenir.",
        sections: [
          {
            title: "Capture rapide",
            paragraphs: [
              "Utilisez Vibeapp pour enregistrer une note, parler, prendre une photo, filmer ou ajouter un document. Vous n'avez pas à décider immédiatement à quelle expérience il appartient.",
              "La preuve reste protégée et apparaît ensuite dans VibePWA 2 comme contenu à organiser.",
            ],
          },
          {
            title: "Créer une histoire",
            steps: [
              "Ouvrez Histoires et choisissez Nouvelle histoire.",
              "Écrivez un titre court et racontez ce qui s'est passé avec vos mots.",
              "Confirmez la date, la personne ou le groupe et le domaine de vie.",
              "Sélectionnez visuellement les preuves utiles.",
              "Ajoutez des événements facultatifs si certains sous-moments comptent.",
              "Enregistrez l'histoire.",
            ],
            note: "Le récit est votre langage pour raconter ce que vous avez vécu. OCR, vision automatique, biométrie et météo ajoutent du contexte sans remplacer votre récit.",
          },
          {
            title: "Modifier et réorganiser",
            paragraphs: [
              "Vous pouvez changer le récit, ajouter ou retirer des fichiers, fusionner ou diviser des histoires et transformer un événement en histoire. Retirer un fichier d'une histoire ne supprime pas l'original.",
            ],
          },
        ],
      },
      {
        id: "multimodalidad",
        title: "Preuves multimodales",
        lead: "La galerie présente chaque contenu de manière reconnaissable, sans imposer de noms de fichiers techniques.",
        sections: [
          {
            title: "Présentation du contenu",
            steps: [
              "Images : miniature et date.",
              "Vidéos : miniature, durée et lecture.",
              "Audios : écoute et transcription si disponible.",
              "Textes : extrait lisible.",
              "Documents : icône, nom et résumé disponible.",
              "Biométrie et contexte : mesures claires, source et heure.",
            ],
          },
          {
            title: "États simples",
            paragraphs: [
              "À organiser signifie que le contenu est stocké mais pas encore lié à une histoire. Lié signifie qu'il en fait déjà partie. Attention requise signifie que l'original est conservé mais doit être vérifié.",
            ],
            note: "Une preuve isolée reste disponible pour les rapports, constats et publications. Tout ne doit pas devenir une histoire.",
          },
          {
            title: "Lunettes Meta et autres appareils",
            paragraphs: [
              "Les photos et vidéos des Ray-Ban Meta ou Oakley Meta sont d'abord importées sur le téléphone avec l'application Meta AI. Depuis la galerie de l'iPhone, de l'iPad ou d'Android, Vibeapp les envoie comme preuves normales ; aucun fichier CSV n'est attendu.",
              "Vibeapp sert de porte d'entrée de capture sur téléphones et tablettes. Les montres et bagues transmettent leurs mesures via Apple Health, Health Connect ou Oura, selon l'appareil et les autorisations accordées.",
            ],
          },
        ],
      },
      {
        id: "grupos-agenda",
        title: "Groupes, personnes et agenda",
        lead: "Le compte appartient à l'utilisateur. Les groupes ou personnes séparent les informations sans mélanger les propriétaires.",
        sections: [
          {
            title: "Utiliser les groupes ou personnes",
            steps: [
              "Créez le groupe ou la personne depuis Compte.",
              "Sélectionnez pour qui vous capturez.",
              "Vibeapp conserve ce choix pour les captures suivantes.",
              "VibePWA filtre les histoires et résultats par personne ou groupe.",
            ],
            note: "Désactiver un groupe empêche de nouvelles captures mais conserve ses histoires et fichiers antérieurs.",
          },
          {
            title: "Agenda",
            paragraphs: [
              "L'agenda enregistre ce qui est prévu. Un rendez-vous ne devient pas automatiquement une expérience. Après l'événement, vous pouvez créer une histoire et utiliser le rendez-vous comme contexte.",
              "L'agenda aide à situer le moment, les personnes et le lieu sans inventer un récit absent.",
            ],
          },
        ],
      },
      {
        id: "salud-contexto",
        title: "Santé, lieu et contexte automatique",
        lead: "Le contexte aide à comprendre un moment, mais ne devient pas à lui seul une expérience.",
        sections: [
          {
            title: "Apple Health et HealthKit",
            paragraphs: [
              "La lecture normale d'Apple Health se fait dans Vibeapp via HealthKit et les autorisations de l'iPhone. L'import manuel de VibePWA sert uniquement à la sauvegarde, à l'historique ou à la récupération.",
              "Pas, fréquence cardiaque, sommeil et énergie active apparaissent lorsqu'ils existent. Une lecture absente est indiquée comme insuffisante et ne devient jamais zéro.",
            ],
          },
          {
            title: "Android, Samsung et Health Connect",
            paragraphs: [
              "Sur Android, Vibeapp lit les données autorisées via Health Connect. C'est aussi la voie privilégiée pour les montres Samsung Galaxy compatibles.",
              "La disponibilité dépend du modèle, de la version du système et des autorisations. Vibe n'affiche que les mesures réellement reçues.",
            ],
          },
          {
            title: "Oura",
            steps: [
              "Ouvrez Compte puis Intégrations.",
              "Choisissez Connecter Oura.",
              "Autorisez les catégories souhaitées sur la page officielle Oura.",
              "Revenez à Vibe et consultez la dernière synchronisation.",
            ],
            note: "Oura apporte les mesures autorisées de sommeil, activité, préparation et autres. Elles sont du contexte, pas des histoires séparées.",
          },
          {
            title: "Lieu, météo, actualités et sorties",
            paragraphs: [
              "Avec votre permission, Vibeapp fournit le lieu du moment. Vibe l'utilise pour actualiser automatiquement météo, actualités et sorties disponibles, comme cinéma, théâtre, concerts et événements locaux.",
              "Sources et dates restent visibles. Une mise à jour tardive ou échouée apparaît comme en attente et n'est jamais présentée comme actuelle.",
            ],
          },
        ],
      },
      {
        id: "inteligencia",
        title: "Rapports et constats",
        lead: "L'intelligence transforme faits et mesures en lecture claire sans confondre données et récit.",
        sections: [
          {
            title: "Définir la portée",
            steps: [
              "Choisissez la période.",
              "Choisissez la personne ou le groupe.",
              "Sélectionnez éventuellement un domaine de vie.",
              "Choisissez toutes les données, les histoires ou les preuves.",
              "Générez le résultat.",
            ],
          },
          {
            title: "Rapport",
            paragraphs: [
              "Le rapport organise activité, mesures, couverture des domaines de vie et évolution. Il inclut les données biométriques disponibles et indique clairement ce qui manque.",
            ],
          },
          {
            title: "Constats",
            paragraphs: [
              "Les constats séparent l'observation vérifiable de l'interprétation. Ils affichent aussi le niveau de confiance et proposent une prochaine action avec un langage humain.",
            ],
            note: "Domaine de vie est le terme unique pour classer l'activité. Bien-être est un état et Foyer est un lieu.",
          },
        ],
      },
      {
        id: "publicar",
        title: "Publications, PDF et vidéos",
        lead: "Publier combine histoires et preuves dans un document chronologique qui peut ensuite être édité dans un autre outil.",
        sections: [
          {
            title: "Créer une publication",
            steps: [
              "Définissez période et personne ou groupe.",
              "Choisissez les histoires et preuves à inclure.",
              "Vérifiez l'ordre et le titre.",
              "Générez la publication.",
            ],
          },
          {
            title: "Contenu téléchargé",
            paragraphs: [
              "Sans vidéo, Vibe génère un PDF. Avec des vidéos sélectionnées, il crée un fichier ZIP contenant le PDF et les vidéos associées.",
              "Les images sont orientées correctement. Audios, documents et mesures reçoivent des références claires.",
            ],
            note: "Vibe n'invente pas les faits. Il organise et édite le matériel disponible en respectant ce qui s'est réellement passé.",
          },
        ],
      },
      {
        id: "obsidian",
        title: "Carte des expériences et Obsidian",
        lead: "Obsidian permet d'explorer relations, apprentissages et tendances issus d'histoires confirmées.",
        sections: [
          {
            title: "Où le trouver",
            steps: [
              "Ouvrez l'onglet Carte dans la navigation principale de VibePWA.",
              "Consultez les personnes, les récits, les preuves et l'état de la vue structurée.",
              "Sélectionnez Actualiser la carte pour vérifier la vue ou Envoyer vers Obsidian pour l'écrire dans le coffre configuré.",
            ],
          },
          {
            title: "Ce qui est exporté",
            paragraphs: [
              "Vibe envoie des notes d'expériences, des événements significatifs et des références d'actifs. Biométrie, lieu et météo enrichissent les notes dans le temps sans devenir des expériences séparées.",
            ],
          },
          {
            title: "Curation protégée",
            paragraphs: [
              "La zone automatique peut être régénérée. La zone de curation humaine reste intacte afin de préserver vos apprentissages et commentaires.",
              "Le coffre est un outil de connaissance dérivé. Les changements importants des histoires se font dans VibePWA.",
            ],
          },
        ],
      },
      {
        id: "privacidad-sync",
        title: "Confidentialité, mode hors ligne et synchronisation",
        lead: "L'utilisateur doit savoir si un élément est enregistré, en attente ou à vérifier sans interpréter de message technique.",
        sections: [
          {
            title: "Confidentialité",
            paragraphs: [
              "Chaque utilisateur ne voit que son compte et ses groupes autorisés. Les fichiers sont privés et les téléchargements utilisent des liens temporaires.",
              "Les autorisations santé, lieu, caméra et microphone sont demandées par fonction et peuvent être retirées sur l'appareil.",
            ],
          },
          {
            title: "Hors ligne",
            paragraphs: [
              "Vibeapp conserve le fichier sur l'appareil sans réseau. Au retour de la connexion, l'envoi reprend avec l'heure d'origine et sans doublon.",
            ],
          },
          {
            title: "États de synchronisation",
            steps: [
              "Enregistré : le serveur a confirmé contenu et fiche.",
              "Envoi : le transfert continue.",
              "Sera envoyé plus tard : reste dans la file locale.",
              "Nouvel essai : une panne temporaire s'est produite.",
              "Attention requise : l'original est protégé mais doit être vérifié.",
            ],
          },
        ],
      },
      {
        id: "cuenta-idiomas",
        title: "Compte, langues et apparence",
        lead: "Les préférences personnelles ne modifient ni ne suppriment les informations.",
        sections: [
          {
            title: "Préférences",
            paragraphs: [
              "Depuis Compte, choisissez espagnol, anglais, français ou portugais, ainsi que l'affichage clair ou sombre. Toutes les fonctions et tous les messages utilisent la langue choisie.",
            ],
          },
          {
            title: "Usage normal et exploitation",
            paragraphs: [
              "L'usage quotidien se concentre sur Accueil, Histoires, Preuves, Intelligence et Publier. Les détails techniques, sauvegardes et diagnostics restent dans Exploitation.",
            ],
          },
        ],
      },
      {
        id: "solucion-problemas",
        title: "Résolution des problèmes",
        lead: "Avant de répéter une capture ou de supprimer des données, identifiez l'état affiché par Vibe.",
        sections: [
          {
            title: "Je ne vois pas une capture",
            steps: [
              "Consultez État dans Vibeapp.",
              "Vérifiez si elle est enregistrée, en cours ou en attente.",
              "Dans VibePWA, ouvrez Preuves et actualisez la file.",
              "Retirez les filtres de date, type et personne.",
              "Si elle demande une attention, ouvrez le détail et conservez le fichier.",
            ],
          },
          {
            title: "Je ne vois pas les mesures ou le contexte",
            steps: [
              "Confirmez les autorisations de l'appareil.",
              "Vérifiez la date et la personne.",
              "Consultez la dernière synchronisation Oura ou santé.",
              "Une lecture absente apparaît comme insuffisante.",
            ],
          },
          {
            title: "Le PDF ne se génère pas",
            steps: [
              "Gardez la session ouverte.",
              "Réduisez la période uniquement pour isoler le contenu problématique.",
              "Vérifiez la disponibilité des fichiers choisis.",
              "Ouvrez Exploitation et notez la version et le message visible.",
            ],
          },
          {
            title: "L'application semble ancienne",
            paragraphs: [
              "Utilisez Mettre à jour l'application depuis Compte. Cette action renouvelle l'interface sans supprimer histoires ni fichiers.",
            ],
          },
        ],
      },
      {
        id: "operacion",
        title: "Exploitation et diagnostic",
        lead: "Cette section s'adresse au support et à l'administration. Elle n'est pas nécessaire pour capturer, organiser ou publier.",
        operation: true,
        sections: [
          {
            title: "Points à vérifier",
            steps: [
              "Version de VibePWA 2 et du contrat.",
              "Disponibilité du service.",
              "Connexion à la base et aux fichiers.",
              "Captures ou tâches en attente.",
              "Dernière erreur et étape confirmée.",
              "État d'Oura et des autres intégrations.",
            ],
          },
          {
            title: "Ce que signifie un service vert",
            paragraphs: [
              "Un serveur démarré ne garantit pas l'enregistrement des fichiers. Le fonctionnement complet confirme service, base, stockage et capture authentifiée.",
            ],
            note: "Ne partagez pas mots de passe, jetons, clés Supabase ou secrets d'intégration dans les captures d'écran ou notes de support.",
          },
          {
            title: "Quand demander de l'aide",
            paragraphs: [
              "Demandez de l'aide si un élément reste en Attention requise, si la même erreur revient après mise à jour ou si les comptes diffèrent entre appareils.",
              "Indiquez date, version, type de contenu et message visible. N'envoyez pas plusieurs copies du même fichier.",
            ],
          },
        ],
      },
    ],
  },
  pt: {
    documentTitle: "Manual do usuário · VibePWA 2",
    eyebrow: "Guia completo de uso",
    title: "VibePWA 2",
    subtitle: "Um guia claro para capturar o que importa, transformar em histórias e produzir relatórios, descobertas, publicações e conhecimento útil.",
    updated: "Edição de produto",
    languages: "ES · EN · FR · PT",
    audience: "Uso pessoal e por grupos",
    language: "Idioma",
    print: "Imprimir ou salvar PDF",
    back: "Voltar ao Vibe",
    search: "Buscar no manual",
    searchPlaceholder: "Exemplo: Oura, vídeos, sincronização...",
    contents: "Conteúdo",
    noResults: "Nenhum capítulo corresponde a essas palavras. Tente um termo mais curto.",
    chapter: "Capítulo",
    footer: "VibePWA 2 · Manual do usuário e operação",
    quick: {
      title: "O caminho mais simples",
      steps: [
        ["Capturar", "O Vibeapp salva o fato quando ele acontece."],
        ["Revisar", "O VibePWA apresenta as evidências visualmente."],
        ["Contar", "Monte uma história quando quiser dar sentido ao momento."],
        ["Explorar", "Crie análises, publicações ou conhecimento."],
      ],
    },
    chapters: [
      {
        id: "ecosistema",
        title: "O ecossistema Vibe",
        lead: "O Vibe reúne componentes com papéis diferentes, todos trabalhando com a mesma conta e as mesmas informações.",
        sections: [
          {
            title: "Quem faz o quê",
            paragraphs: [
              "O Vibeapp acompanha o telefone ou tablet e cuida da captura imediata. O VibePWA 2 organiza as evidências, monta histórias e gera resultados. O servidor Vibe sincroniza e protege os dados.",
              "O Obsidian recebe uma cópia organizada para curadoria e aprendizagem. Vibepub ou MagStudio podem ser usados depois para edição avançada.",
            ],
            steps: [
              "Vibeapp: texto, voz, fotos, vídeos, documentos, localização e saúde.",
              "VibePWA 2: histórias, evidências, relatórios, descobertas, publicações e conta.",
              "Obsidian: mapa derivado e notas de conhecimento.",
              "Vibepub: edição final para outros canais.",
            ],
            note: "Supabase e o servidor Vibe são a fonte principal. O Obsidian não substitui o armazenamento do Vibe.",
          },
          {
            title: "O que pode ser preservado",
            paragraphs: [
              "O Vibe combina o que você conta com o que seus dispositivos capturam. Uma foto, um áudio, uma medição ou localização podem pertencer ao mesmo momento sem perder o formato original.",
            ],
          },
        ],
      },
      {
        id: "captura-historias",
        title: "Capturar não é o mesmo que contar uma história",
        lead: "Os fatos costumam ser registrados no momento. A história pode ser montada depois, quando você souber o que deseja lembrar.",
        sections: [
          {
            title: "Captura rápida",
            paragraphs: [
              "Use o Vibeapp para salvar uma nota, falar, tirar uma foto, gravar vídeo ou adicionar um documento. Você não precisa decidir imediatamente a qual experiência pertence.",
              "A evidência fica protegida e aparece depois no VibePWA 2 como conteúdo para organizar.",
            ],
          },
          {
            title: "Criar uma história",
            steps: [
              "Abra Histórias e escolha Nova história.",
              "Escreva um título curto e conte o que aconteceu com suas palavras.",
              "Confirme data, pessoa ou grupo e área da vida.",
              "Selecione visualmente as evidências da história.",
              "Adicione eventos opcionais quando houver submomentos importantes.",
              "Salve a história.",
            ],
            note: "Narrativa é a sua linguagem contando o que viveu. OCR, visão automática, biometria e clima acrescentam contexto, mas não substituem o seu relato.",
          },
          {
            title: "Editar e reorganizar",
            paragraphs: [
              "Você pode mudar a narrativa, adicionar ou retirar arquivos, unir histórias, dividir uma história ou transformar um evento em história própria. Retirar um arquivo não apaga o original.",
            ],
          },
        ],
      },
      {
        id: "multimodalidad",
        title: "Evidências multimodais",
        lead: "A galeria apresenta cada conteúdo de forma reconhecível para que você escolha sem ler nomes técnicos.",
        sections: [
          {
            title: "Como o conteúdo aparece",
            steps: [
              "Imagens: miniatura e data.",
              "Vídeos: miniatura, duração e reprodução.",
              "Áudios: controles e transcrição quando existir.",
              "Textos: trecho legível.",
              "Documentos: ícone, nome e resumo disponível.",
              "Biometria e contexto: métricas claras com fonte e hora.",
            ],
          },
          {
            title: "Estados simples",
            paragraphs: [
              "Para organizar significa que o conteúdo está salvo, mas ainda não pertence a uma história. Vinculada significa que já faz parte de uma. Requer atenção significa que o original está protegido, mas precisa de revisão.",
            ],
            note: "Uma evidência solta continua disponível para relatórios, descobertas e publicações. Nem tudo precisa virar história.",
          },
          {
            title: "Óculos Meta e outros dispositivos",
            paragraphs: [
              "Fotos e vídeos dos Ray-Ban Meta ou Oakley Meta são importados primeiro para o telefone pelo app Meta AI. Da galeria do iPhone, iPad ou Android, o Vibeapp os envia como evidência normal; não se espera um arquivo CSV.",
              "O Vibeapp é a porta de captura em telefones e tablets. Relógios e anéis fornecem medições por Apple Health, Health Connect ou Oura, conforme o dispositivo e as permissões concedidas.",
            ],
          },
        ],
      },
      {
        id: "grupos-agenda",
        title: "Grupos, pessoas e agenda",
        lead: "A conta pertence ao usuário. Grupos ou pessoas separam informações sem misturar proprietários.",
        sections: [
          {
            title: "Usar grupos ou pessoas",
            steps: [
              "Crie o grupo ou pessoa em Conta.",
              "Selecione para quem está capturando.",
              "O Vibeapp conserva a seleção nas capturas seguintes.",
              "O VibePWA filtra histórias e resultados por pessoa ou grupo.",
            ],
            note: "Desativar um grupo impede novas capturas, mas preserva suas histórias e arquivos anteriores.",
          },
          {
            title: "Agenda",
            paragraphs: [
              "A agenda registra o que está planejado. Um compromisso não vira experiência automaticamente. Depois do evento, você pode criar uma história e usar o compromisso como contexto.",
              "A agenda ajuda a identificar momento, pessoas e lugar sem inventar um relato que não foi contado.",
            ],
          },
        ],
      },
      {
        id: "salud-contexto",
        title: "Saúde, localização e contexto automático",
        lead: "O contexto ajuda a compreender um momento, mas não vira experiência sozinho.",
        sections: [
          {
            title: "Apple Health e HealthKit",
            paragraphs: [
              "A leitura normal do Apple Health acontece no Vibeapp por meio do HealthKit e das permissões do iPhone. A importação manual do VibePWA serve apenas para backup, histórico ou recuperação.",
              "Passos, frequência cardíaca, sono e energia ativa aparecem quando existem. Uma leitura ausente é mostrada como insuficiente e nunca vira zero.",
            ],
          },
          {
            title: "Android, Samsung e Health Connect",
            paragraphs: [
              "No Android, o Vibeapp lê dados autorizados pelo Health Connect. Essa também é a via preferida para relógios Samsung Galaxy compatíveis.",
              "A disponibilidade depende do modelo, da versão do sistema e das permissões do usuário. O Vibe mostra apenas as medições realmente recebidas.",
            ],
          },
          {
            title: "Oura",
            steps: [
              "Abra Conta e procure Integrações.",
              "Selecione Conectar Oura.",
              "Autorize as categorias desejadas na página oficial da Oura.",
              "Volte ao Vibe e confira a última sincronização.",
            ],
            note: "Oura fornece métricas autorizadas de sono, atividade, prontidão e outras. Elas são contexto, não histórias separadas.",
          },
          {
            title: "Localização, clima, notícias e programação",
            paragraphs: [
              "Com sua permissão, o Vibeapp fornece a localização do momento. O Vibe usa essa referência para atualizar automaticamente clima, notícias e entretenimento atual, como cinema, teatro, shows e eventos da cidade.",
              "Fontes e datas permanecem visíveis. Uma atualização atrasada ou com falha aparece como pendente e não é mostrada como atual.",
            ],
          },
        ],
      },
      {
        id: "inteligencia",
        title: "Relatórios e descobertas",
        lead: "A inteligência transforma fatos e medições em uma leitura clara sem confundir dados com narrativa.",
        sections: [
          {
            title: "Definir o alcance",
            steps: [
              "Escolha o período.",
              "Escolha a pessoa ou grupo.",
              "Selecione uma área da vida se desejar.",
              "Escolha todos os registros, histórias ou evidências.",
              "Gere o resultado.",
            ],
          },
          {
            title: "Relatório",
            paragraphs: [
              "O relatório organiza atividade, medições, cobertura por áreas da vida e evolução. Inclui métricas biométricas disponíveis e informa claramente o que falta.",
            ],
          },
          {
            title: "Descobertas",
            paragraphs: [
              "As descobertas separam a observação comprovável da interpretação. Também mostram confiança e sugerem uma próxima ação em linguagem humana.",
            ],
            note: "Área da vida é o termo único para classificar atividade. Bem-estar é um estado e Lar é um lugar.",
          },
        ],
      },
      {
        id: "publicar",
        title: "Publicações, PDF e vídeos",
        lead: "Publicar combina histórias e evidências em um documento cronológico que pode ser editado depois em outra ferramenta.",
        sections: [
          {
            title: "Criar uma publicação",
            steps: [
              "Defina período e pessoa ou grupo.",
              "Escolha histórias e evidências.",
              "Revise ordem e título.",
              "Gere a publicação.",
            ],
          },
          {
            title: "O que é baixado",
            paragraphs: [
              "Sem vídeos, o Vibe gera um PDF. Com vídeos selecionados, cria um pacote ZIP com o PDF e os arquivos de vídeo relacionados.",
              "As imagens entram no PDF com orientação correta. Áudios, documentos e medições recebem referências claras.",
            ],
            note: "O Vibe não inventa fatos. Ele organiza e edita o material disponível respeitando o que realmente aconteceu.",
          },
        ],
      },
      {
        id: "obsidian",
        title: "Mapa de experiências e Obsidian",
        lead: "O Obsidian permite explorar relações, aprendizados e tendências a partir de histórias confirmadas.",
        sections: [
          {
            title: "Onde encontrar",
            steps: [
              "Abra a aba Mapa na navegação principal do VibePWA.",
              "Revise pessoas, histórias, evidências e o estado da visão estruturada.",
              "Selecione Atualizar mapa para verificar a visão ou Enviar ao Obsidian para gravá-la no cofre configurado.",
            ],
          },
          {
            title: "O que é exportado",
            paragraphs: [
              "O Vibe envia notas de experiências, eventos relevantes e referências de ativos. Biometria, localização e clima enriquecem as notas por tempo, mas não viram experiências separadas.",
            ],
          },
          {
            title: "Curadoria protegida",
            paragraphs: [
              "A área automática pode ser regenerada. A área de curadoria humana é preservada para que aprendizados e comentários sobrevivam às próximas exportações.",
              "O cofre é uma ferramenta derivada de conhecimento. Mudanças importantes nas histórias devem ser feitas no VibePWA.",
            ],
          },
        ],
      },
      {
        id: "privacidad-sync",
        title: "Privacidade, uso offline e sincronização",
        lead: "O usuário deve saber se algo está salvo, pendente ou requer atenção sem interpretar mensagens técnicas.",
        sections: [
          {
            title: "Privacidade",
            paragraphs: [
              "Cada usuário vê apenas sua conta e grupos autorizados. Os arquivos são privados e os downloads usam links temporários.",
              "Permissões de saúde, localização, câmera e microfone são solicitadas por função e podem ser revogadas no dispositivo.",
            ],
          },
          {
            title: "Sem conexão",
            paragraphs: [
              "O Vibeapp conserva o arquivo no dispositivo quando não há sinal. Ao recuperar conexão, continua o envio com a hora original e sem duplicar.",
            ],
          },
          {
            title: "Estados de sincronização",
            steps: [
              "Salvo: o servidor confirmou conteúdo e registro.",
              "Enviando: a transferência continua.",
              "Será enviado depois: permanece na fila local.",
              "Tentando novamente: houve uma falha temporária.",
              "Requer atenção: o original está protegido, mas precisa de revisão.",
            ],
          },
        ],
      },
      {
        id: "cuenta-idiomas",
        title: "Conta, idiomas e aparência",
        lead: "As preferências pessoais não alteram nem apagam informações salvas.",
        sections: [
          {
            title: "Preferências",
            paragraphs: [
              "Em Conta, escolha espanhol, inglês, francês ou português e aparência clara ou escura. Todas as funções e mensagens devem usar o idioma escolhido.",
            ],
          },
          {
            title: "Uso normal e operação",
            paragraphs: [
              "O uso diário se concentra em Início, Histórias, Evidências, Inteligência e Publicar. Detalhes técnicos, backups e diagnósticos ficam em Operação.",
            ],
          },
        ],
      },
      {
        id: "solucion-problemas",
        title: "Solução de problemas",
        lead: "Antes de repetir uma captura ou apagar informações, identifique o estado mostrado pelo Vibe.",
        sections: [
          {
            title: "Não vejo uma captura",
            steps: [
              "Revise Estado no Vibeapp.",
              "Confira se está salva, enviando ou pendente.",
              "No VibePWA, abra Evidências e atualize a bandeja.",
              "Remova filtros de data, tipo e pessoa.",
              "Se requer atenção, abra o detalhe e preserve o arquivo.",
            ],
          },
          {
            title: "Não vejo métricas ou contexto",
            steps: [
              "Confirme permissões do dispositivo.",
              "Revise data e pessoa.",
              "Confira a última sincronização de Oura ou saúde.",
              "Uma leitura ausente aparece como insuficiente.",
            ],
          },
          {
            title: "O PDF não é gerado",
            steps: [
              "Mantenha a sessão aberta.",
              "Reduza o período apenas para identificar o conteúdo problemático.",
              "Verifique se os arquivos selecionados estão disponíveis.",
              "Abra Operação e anote versão e mensagem visível.",
            ],
          },
          {
            title: "O aplicativo parece desatualizado",
            paragraphs: [
              "Use Atualizar aplicativo em Conta. Essa ação renova a interface sem apagar histórias ou arquivos.",
            ],
          },
        ],
      },
      {
        id: "operacion",
        title: "Operação e diagnóstico",
        lead: "Esta seção é destinada a suporte e administração. Não é necessária para capturar, organizar ou publicar.",
        operation: true,
        sections: [
          {
            title: "O que revisar",
            steps: [
              "Versão do VibePWA 2 e do contrato.",
              "Disponibilidade do serviço.",
              "Conexão com banco de dados e arquivos.",
              "Capturas ou tarefas pendentes.",
              "Último erro e etapa confirmada.",
              "Estado da Oura e outras integrações.",
            ],
          },
          {
            title: "O que significa um serviço verde",
            paragraphs: [
              "Um servidor ligado não garante que arquivos possam ser salvos. A operação completa confirma serviço, banco, armazenamento e uma captura autenticada.",
            ],
            note: "Não compartilhe senhas, tokens, chaves do Supabase ou segredos de integrações em capturas de tela ou notas de suporte.",
          },
          {
            title: "Quando pedir suporte",
            paragraphs: [
              "Peça suporte quando um item permanece em Requer atenção, o mesmo erro volta após atualizar ou as contagens diferem entre dispositivos.",
              "Inclua data, versão, tipo de conteúdo e mensagem visível. Não envie várias cópias do mesmo arquivo.",
            ],
          },
        ],
      },
    ],
  },
};

renderManual();

function renderManual() {
  const copy = copies[locale] || copies.es;
  document.documentElement.lang = locale;
  document.title = copy.documentTitle;
  document.getElementById("manual").innerHTML = `
    <header class="manual-hero">
      <div class="manual-hero-inner">
        <div class="manual-toolbar">
          <a class="manual-brand" href="./index.html" aria-label="${escapeHtml(copy.back)}">
            <span class="manual-brand-mark" aria-hidden="true">V</span>
            <span>Vibe</span>
          </a>
          <div class="manual-actions">
            <label class="manual-field" for="manualLanguage">
              <span>${escapeHtml(copy.language)}</span>
              <select id="manualLanguage">
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="pt">Português</option>
              </select>
            </label>
            <button id="printManual" class="manual-button primary" type="button">${escapeHtml(copy.print)}</button>
            <a class="manual-button" href="./index.html">${escapeHtml(copy.back)}</a>
          </div>
        </div>
        <p class="manual-eyebrow">${escapeHtml(copy.eyebrow)}</p>
        <h1>${escapeHtml(copy.title)}</h1>
        <p class="manual-subtitle">${escapeHtml(copy.subtitle)}</p>
        <div class="manual-meta">
          <span>${escapeHtml(copy.updated)}</span>
          <span>${escapeHtml(copy.languages)}</span>
          <span>${escapeHtml(copy.audience)}</span>
        </div>
      </div>
    </header>
    <div class="manual-layout">
      <aside class="manual-sidebar">
        <div class="manual-search">
          <label for="manualSearch">${escapeHtml(copy.search)}</label>
          <input id="manualSearch" type="search" placeholder="${escapeHtml(copy.searchPlaceholder)}" autocomplete="off" />
        </div>
        <div class="manual-toc">
          <h2 class="manual-toc-title">${escapeHtml(copy.contents)}</h2>
          <nav aria-label="${escapeHtml(copy.contents)}">
            ${copy.chapters.map((item) => `
              <a href="#${escapeHtml(item.id)}" data-toc="${escapeHtml(item.id)}">${escapeHtml(item.title)}</a>
            `).join("")}
          </nav>
        </div>
      </aside>
      <article class="manual-main">
        <section class="manual-quick" aria-labelledby="quickTitle">
          <h2 id="quickTitle">${escapeHtml(copy.quick.title)}</h2>
          <div class="manual-path">
            ${copy.quick.steps.map(([title, body]) => `
              <div class="manual-path-item">
                <strong>${escapeHtml(title)}</strong>
                <span>${escapeHtml(body)}</span>
              </div>
            `).join("")}
          </div>
        </section>
        ${copy.chapters.map((item, index) => renderChapter(item, index, copy)).join("")}
        <div id="manualEmpty" class="manual-empty">${escapeHtml(copy.noResults)}</div>
        <footer class="manual-footer">${escapeHtml(copy.footer)}</footer>
      </article>
    </div>
  `;

  const selector = document.getElementById("manualLanguage");
  selector.value = locale;
  selector.addEventListener("change", () => {
    locale = normalizeLocale(selector.value);
    localStorage.setItem("vibe-next-language", locale);
    renderManual();
  });

  const search = document.getElementById("manualSearch");
  search.addEventListener("input", () => filterManual(search.value));
  document.getElementById("printManual").addEventListener("click", () => {
    search.value = "";
    filterManual("");
    window.print();
  });
  observeChapters();
}

function renderChapter(chapter, index, copy) {
  return `
    <section id="${escapeHtml(chapter.id)}" class="manual-chapter${chapter.operation ? " operation" : ""}" data-search="${escapeHtml(chapterSearchText(chapter))}">
      <p class="manual-chapter-number">${escapeHtml(copy.chapter)} ${index + 1}</p>
      <h2>${escapeHtml(chapter.title)}</h2>
      <p class="manual-chapter-lead">${escapeHtml(chapter.lead)}</p>
      ${chapter.sections.map(renderSection).join("")}
    </section>
  `;
}

function renderSection(section) {
  return `
    <div class="manual-section">
      <h3>${escapeHtml(section.title)}</h3>
      ${(section.paragraphs || []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
      ${section.steps?.length ? `<ol>${section.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>` : ""}
      ${section.note ? `<div class="manual-note">${escapeHtml(section.note)}</div>` : ""}
    </div>
  `;
}

function filterManual(value) {
  const term = normalizeSearch(value);
  let visible = 0;
  document.querySelectorAll(".manual-chapter").forEach((chapter) => {
    const match = !term || normalizeSearch(chapter.dataset.search).includes(term);
    chapter.hidden = !match;
    const toc = document.querySelector(`[data-toc="${chapter.id}"]`);
    if (toc) toc.hidden = !match;
    if (match) visible += 1;
  });
  document.getElementById("manualEmpty").style.display = visible ? "none" : "block";
}

function observeChapters() {
  chapterObserver?.disconnect();
  chapterObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting && !entry.target.hidden)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    document.querySelectorAll("[data-toc]").forEach((link) => {
      link.setAttribute("aria-current", link.dataset.toc === visible.target.id ? "true" : "false");
    });
  }, { rootMargin: "-15% 0px -70% 0px", threshold: [0.05, 0.25, 0.6] });
  document.querySelectorAll(".manual-chapter").forEach((chapter) => chapterObserver.observe(chapter));
}

function chapterSearchText(chapter) {
  return [
    chapter.title,
    chapter.lead,
    ...chapter.sections.flatMap((section) => [
      section.title,
      ...(section.paragraphs || []),
      ...(section.steps || []),
      section.note || "",
    ]),
  ].join(" ");
}

function normalizeLocale(value) {
  const code = String(value || "es").slice(0, 2).toLowerCase();
  return ["es", "en", "fr", "pt"].includes(code) ? code : "es";
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
}
