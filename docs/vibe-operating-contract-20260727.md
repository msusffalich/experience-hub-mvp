# Contrato operativo canónico del ecosistema Vibe

Fecha: 2026-07-27
Estado: vigente
Sustituye: contratos que permitían crear experiencias o eventos desde Vibeapp.

## 1. Responsabilidades

### Vibeapp

Vibeapp captura y entrega hechos:

- texto humano;
- audio y voz;
- imagen;
- video;
- documento;
- biometría;
- ubicación;
- clima;
- noticias;
- agenda;
- señales de dispositivos y conectores.

Vibeapp conserva una cola local durable y reintenta con la misma clave. No crea,
edita, une, divide ni elimina experiencias o eventos.

### VibePWA

VibePWA organiza y explota la información:

- busca y previsualiza evidencia;
- crea y edita historias;
- crea eventos dentro de una historia;
- vincula, retira o reorganiza evidencia;
- genera reportes, hallazgos y publicaciones;
- exporta historias confirmadas al mapa y a Obsidian;
- administra cuenta, grupos/personas, privacidad y operación.

### Servidor y Supabase

Son la fuente de verdad. El servidor autentica y orquesta; Supabase conserva
operaciones, catálogo, contexto, historias y vínculos. Storage privado conserva
los archivos originales.

### Obsidian

Recibe únicamente historias confirmadas. Conserva la zona generada por Vibe y
la curaduría humana sin sobrescribirla.

## 2. Flujos separados

### Capturar

1. El usuario captura en Vibeapp.
2. Vibeapp asigna `captureId` e `idempotencyKey`.
3. La cola local conserva el original.
4. Vibeapp envía a `POST /api/captures`.
5. El servidor guarda y verifica archivo y catálogo.
6. El servidor devuelve un recibo durable.
7. Solo entonces Vibeapp retira el elemento de la cola.

### Crear una historia

1. VibePWA muestra evidencia mediante miniaturas, reproductores y extractos.
2. El usuario elige una ventana temporal y la persona/grupo.
3. El usuario selecciona evidencia y escribe o dicta la narrativa.
4. VibePWA crea la historia y, opcionalmente, eventos.
5. El Servicio de Historias guarda los vínculos; nunca vuelve a subir archivos.

La evidencia no seleccionada permanece disponible. No se borra ni se convierte
automáticamente en una experiencia.

## 3. Reglas de datos

- Una captura declara `intent=evidence` o `intent=context`.
- La captura no admite `experienceId`, `eventId` ni objetos de historia.
- La historia referencia `captureId` ya existente.
- El contexto se consulta por persona y tiempo; no se adopta como archivo.
- Texto, audio y video pueden contener narrativa humana.
- OCR, visión IA, biometría, clima, ubicación y metadatos son contexto o evidencia.
- Un dato faltante se omite; nunca se convierte en cero.
- Un fallo repetido termina en `needs_attention`; nunca elimina la captura.

## 4. Alcance de reportes, hallazgos y publicaciones

Los tres usan el mismo selector:

1. Período obligatorio, por defecto los últimos siete días.
2. Persona/grupo, por defecto la selección activa del usuario.
3. Base:
   - todo lo registrado;
   - historias confirmadas;
   - evidencia sin necesidad de historia.

Filtros opcionales:

- categoría o actividad;
- ubicación;
- tipo de activo;
- texto;
- historias o activos específicos.

El contexto compatible se incluye automáticamente por persona y período.
Categoría no clasifica evidencia suelta por inferencia. Cuando se usa, incluye
historias de esa categoría y sus activos vinculados; la evidencia no clasificada
se reporta como excluida.

Reportes y Hallazgos ejecutan el alcance confirmado. Publicaciones muestra además
una selección visual final para aprobar qué contenido entra al PDF o paquete.

### Diferencia entre analizar y publicar

El selector de alcance es común, pero la función de cada salida es distinta:

- **Reportes** ordenan hechos y mediciones. Pueden usar experiencias y eventos
  confirmados como registros estructurados, además de evidencia y contexto, pero
  no convierten esos registros en una historia editorial.
- **Hallazgos** buscan patrones, relaciones, cambios y siguientes acciones
  sustentadas en los datos disponibles. Separan observación, interpretación y
  nivel de confianza.
- **Publicaciones** sí pueden usar las narrativas humanas de experiencias y
  eventos como hilo editorial. Las imágenes, videos, audios, documentos y
  mediciones seleccionadas respaldan y enriquecen ese relato.

Una publicación con base `todo` combina historias confirmadas y evidencia del
alcance. Con base `historias`, parte de las narrativas y sus activos vinculados.
Con base `evidencia`, genera un dossier cronológico sin inventar una historia,
una categoría ni hechos ausentes.

La diferencia es de tratamiento, no de fuente: los tres productos consultan el
mismo registro, pero solo Publicaciones realiza composición narrativa editorial.

## 5. Confirmaciones visibles

El usuario recibe solo estados comprensibles:

- Guardado.
- Enviando.
- Se enviará cuando vuelva la conexión.
- Requiere atención.
- Historia creada.
- Salida generada.

Los códigos, rutas, MIME, checksums, proveedores y registros viven en Operación,
no en el recorrido cotidiano.

## 6. Idiomas

Toda función de producto debe quedar completa en:

- español;
- inglés;
- francés;
- portugués.

No se publica una pantalla con traducción parcial.

## 7. Activación segura

La ruta experimental anterior permanece congelada. La nueva ruta de capturas
permanece apagada hasta que:

1. la migración aditiva esté aplicada;
2. la preparación de tablas y bucket sea verde;
3. los tipos de captura pasen pruebas automáticas;
4. el reintento sin conexión y tras reinicio no pierda datos;
5. VibePWA lea exactamente el registro confirmado;
6. el flujo anterior permanezca disponible durante la comparación.

La sustitución ocurre en un bloque controlado y la retirada de rutas antiguas en
un release posterior.
