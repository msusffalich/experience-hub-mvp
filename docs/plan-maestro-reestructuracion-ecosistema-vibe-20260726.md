# Plan maestro de reestructuración integral del ecosistema Vibe

Fecha: 2026-07-26
Estado: implementación paralela en curso; producción estable no sustituida
Alcance: Vibeapp, VibePWA, servidor, Supabase, integraciones, Obsidian,
reportes, hallazgos, publicaciones, operación y documentación.

## Estado de ejecución al 2026-07-27

La arquitectura objetivo sigue vigente, pero su implementación no debe
confundirse con la compatibilidad que aún sostiene producción:

- La interfaz de VibePWA ya usa seis espacios principales: Inicio, Historias,
  Evidencia, Inteligencia, Publicar y Cuenta.
- Agenda, Nueva historia, Línea de tiempo, Hallazgos, Mapa, Ayuda, Operación y
  Automatizaciones son rutas contextuales; no compiten en el menú principal.
- Los filtros técnicos de Evidencia, la exportación a Obsidian y la revisión
  interna del Manual están plegados y fuera del recorrido cotidiano.
- Reportes, Hallazgos y Publicaciones conservan un alcance común. Publicaciones
  muestra primero persona/grupo y material editorial; los filtros de precisión
  quedan en Ajustar selección.
- La API objetivo `POST /api/captures` todavía no sustituye las rutas que usa
  Vibeapp en producción. Las rutas `/api/integration/ingest`,
  `/api/experiences` y `/api/media` se mantienen hasta completar una migración
  móvil probada.
- El contrato objetivo `/api/stories` aún no está implementado como servicio
  independiente. La lógica de historias continúa en la aplicación actual.
- Por lo anterior, la Fase 6 permite limpiar navegación, controles duplicados y
  código aislado, pero no retirar APIs ni adaptadores móviles todavía.

Esta distinción evita declarar terminada una arquitectura que aún conserva
compatibilidad operativa y evita romper Vibeapp durante la limpieza.

### Bloque 718: integridad de interfaz y energía

Este bloque consolida dos decisiones sin alterar los contratos móviles:

- El árbol visible de navegación en `index.html` es la única fuente que define
  qué espacio principal contiene cada vista. La aplicación ya no mantiene un
  segundo mapa manual en JavaScript que pueda divergir.
- La acción se llama **Nueva historia** en español, inglés, francés y portugués.
- La energía percibida es opcional, pertenece al usuario y no tiene valor
  predeterminado.
- Las historias creadas desde agenda, noticias o comandos rápidos no inventan
  energía percibida.
- La ausencia de energía no se transforma en cero, energía baja, riesgo ni
  tendencia negativa.
- Inicio, Reportes, Hallazgos, Publicaciones y Mapa muestran **Sin dato** cuando
  no hay lecturas explícitas suficientes.
- Los KPI compuestos redistribuyen el peso entre señales disponibles. La
  biometría puede aportar una señal separada, pero nunca se presenta como una
  calificación percibida escrita por la persona.
- Dos verificadores automáticos protegen estas reglas:
  `verify:product-shell` y `verify:energy-integrity`.

Las rutas usadas por Vibeapp, el servidor y Supabase no cambian en este bloque.

## 1. Decisión ejecutiva

Vibe se reestructura alrededor de una separación simple:

- **Vibeapp captura y entrega hechos.**
- **VibePWA organiza, interpreta y produce valor.**

Vibeapp no crea experiencias ni eventos. Envía texto, voz, imágenes, videos,
documentos y señales de contexto con persona, fecha, origen y permisos.

VibePWA es el único dueño de las experiencias y eventos. Una experiencia es
opcional: si el usuario desea construir una historia, redacta la narrativa y
elige visualmente sus evidencias. Si no desea hacerlo, la evidencia permanece
disponible para reportes, hallazgos y publicaciones.

El Mapa de Experiencias y Obsidian reciben únicamente experiencias confirmadas,
no archivos sueltos ni señales automáticas.

## 2. Problemas que obligan a reestructurar

### 2.1 Arquitectura

- Conviven rutas antiguas y nuevas para una misma captura.
- El tipo de archivo se ha utilizado para inferir intención de negocio.
- Vibeapp puede intentar crear experiencias, eventos, evidencia y contexto.
- Más de un escritor puede modificar el vínculo entre evidencia y experiencia.
- La recepción del archivo, la creación de la experiencia y la adopción se
  acoplaron como si fueran una sola operación.
- Las pruebas sintéticas no reproducen todos los fallos de Supabase, Storage,
  autenticación, interrupción de red y reintento real.
- El cliente puede agotar reintentos y retirar un elemento sin confirmación
  durable del servidor.

### 2.2 Producto y experiencia de uso

- La navegación contiene demasiadas vistas principales.
- Funciones de usuario, piloto, diagnóstico y administración aparecen mezcladas.
- Persisten botones, textos y paneles antiguos o incompletos.
- El armado de historias se presenta como formulario técnico y no como editor
  visual.
- Nombres de archivo, identificadores, estados y detalles de infraestructura
  ocupan espacios que deberían mostrar contenido humano.
- El indicador de energía no transmite valor confiable y puede mezclar ausencia
  de datos con valores reales.

### 2.3 Documentación y operación

- Existen documentos que describen decisiones diferentes para el mismo flujo.
- Algunos manuales siguen explicando capacidades anteriores o parciales.
- Handchecks y notas temporales contienen decisiones que no siempre llegaron al
  contrato canónico.
- Las pruebas "verdes" no distinguen con suficiente claridad simulación, código,
  entorno controlado y validación física real.

## 3. Principios no negociables

1. **No se pierde una captura.** El móvil conserva el original hasta que el
   servidor confirme almacenamiento durable.
2. **Un concepto, un dueño.** Vibeapp captura; VibePWA crea historias; Supabase
   persiste; Obsidian cura conocimiento.
3. **Una intención explícita.** Ninguna ruta infiere experiencia, evento o
   contexto a partir del MIME, nombre o extensión.
4. **Una ruta lógica por responsabilidad.** No hay doble envío ni fallback que
   cambie silenciosamente el significado.
5. **La evidencia puede existir sin historia.** No se promueve automáticamente.
6. **La historia referencia evidencia; no vuelve a subirla.**
7. **Simple por fuera, sofisticado por dentro.**
8. **Ninguna función se declara terminada sin una prueba del escenario real que
   pretende cubrir.**
9. **Los datos faltantes se omiten.** Nunca se convierten en cero ni en una
   conclusión plausible.
10. **Cuatro idiomas completos:** español, inglés, francés y portugués.

## 4. Arquitectura objetivo

### 4.1 Estrategia técnica

Se adopta un **monolito modular** sobre el backend Node actual.

No se crearán microservicios distribuidos mientras una sola aplicación y una
sola base puedan sostener la carga. Esto evita agregar latencia, despliegues,
credenciales y fallos de red internos.

Cada módulo tendrá:

- contrato de entrada;
- modelo de datos propio;
- servicio de aplicación;
- repositorio de persistencia;
- eventos internos;
- pruebas unitarias, de integración y E2E;
- métricas y registros operativos.

`server.js` dejará de concentrar lógica de negocio. Su responsabilidad será
HTTP, autenticación, validación inicial y delegación a módulos.

### 4.2 Componentes

#### API Gateway / Backend for Frontend

- autentica al usuario;
- valida idioma, versión y permisos;
- asigna un `requestId`;
- limita tamaño, frecuencia y duración;
- delega al servicio correcto;
- devuelve mensajes simples y estados estables.

#### Servicio de Capturas

Única entrada de Vibeapp.

- recibe texto, voz transcrita, imágenes, videos, audios y documentos;
- recibe contexto explícito: biometría, ubicación, clima, noticias y agenda;
- guarda bytes y metadatos;
- genera un recibo durable;
- no crea experiencias ni eventos;
- mantiene evidencia intencional separada de contexto ambiente.

#### Servicio de Evidencia

- cataloga activos;
- administra Storage privado y URL firmada;
- conserva checksum, origen, persona y fecha;
- mantiene estado disponible, pendiente de procesamiento o error;
- permite búsqueda, previsualización, descarga y selección;
- no decide si existe una historia.

#### Servicio de Contexto

- guarda series y señales de biometría, ubicación, clima, noticias y agenda;
- normaliza proveedores sin convertir señales en experiencias;
- permite consulta por persona y ventana temporal;
- alimenta análisis y visualizaciones.

#### Servicio de Historias

Único escritor de experiencias y eventos.

- crea, edita, divide, une, promueve y degrada historias;
- vincula evidencias existentes;
- preserva antecedentes y trazabilidad;
- aplica el contrato de narrativa humana;
- nunca recibe o almacena bytes.

#### Servicio de Inteligencia

- genera reportes y hallazgos;
- permite alcance por fecha, persona, evidencia, historias o ambos;
- separa datos observados, interpretación e hipótesis;
- no inventa energía, Área de vida ni narrativa.

#### Servicio Editorial

- genera publicaciones y paquetes PDF + multimedia;
- consume evidencia, contexto e historias según selección;
- mantiene edición y aprobación humana;
- no modifica los datos de origen.

#### Servicio de Conocimiento

- exporta únicamente historias confirmadas a Obsidian;
- conserva zona automática y curaduría humana;
- genera mapas de conocimiento consistentes;
- no exporta contexto como experiencia.

#### Servicio de Identidad y Grupos

- controla cuentas, accesos, grupos/personas y privacidad;
- aplica aislamiento de datos por usuario y workspace;
- soporta alta, baja, conservación y eliminación conforme a política.

#### Operación y Observabilidad

- muestra salud, colas, errores, proveedores, jobs y versiones;
- vive fuera de la navegación cotidiana;
- permite diagnóstico por `requestId`, `captureId`, `operationId` y usuario;
- nunca presenta éxito cuando falta una etapa obligatoria.

## 5. Orquestador central

Se implementará un orquestador pequeño de procesos, no un "objeto dios".

El orquestador:

- coordina etapas;
- registra estado;
- publica eventos internos;
- programa reintentos;
- impide que una operación se ejecute dos veces;
- informa progreso;
- no contiene reglas editoriales, analíticas ni de interfaz.

### 5.1 Procesos coordinados

- recepción y almacenamiento de captura;
- procesamiento OCR, transcripción o extracción;
- creación y actualización de historia;
- adopción y reorganización de evidencia;
- generación de reporte, hallazgo o publicación;
- exportación a Obsidian;
- sincronización de conectores externos.

### 5.2 Estados comunes

- `accepted`
- `processing`
- `completed`
- `retryable_error`
- `needs_attention`
- `cancelled_by_user`

Un elemento no se elimina automáticamente por alcanzar el máximo de reintentos.
Pasa a `needs_attention` y conserva contenido, causa y acción disponible.

## 6. Protocolo Vibeapp -> servidor

### 6.1 Contrato único de captura

Vibeapp utiliza un único servicio lógico:

`POST /api/captures`

Acepta JSON para texto y contexto, y `multipart/form-data` para archivos.

Campos mínimos:

- `captureId`
- `idempotencyKey`
- `intent`: `evidence` o `context`
- `captureType`
- `capturedAt`
- `participantId`
- `source`
- `sourceDevice`
- `language`
- `metadata`
- contenido o archivo

No admite:

- `experienceId`
- `eventId`
- creación de experiencia;
- adopción;
- reorganización narrativa.

### 6.2 Confirmación

Vibeapp solo muestra "Guardado" cuando recibe:

- HTTP de éxito;
- `receiptId`;
- `captureId`;
- estado `completed`;
- confirmación de contenido almacenado;
- confirmación de registro catalogado.

La cola local es append-only hasta esa confirmación. Un fallo conserva el
elemento y muestra una explicación. Reiniciar, cerrar la app o pasar horas sin
señal no elimina la captura.

### 6.3 Sincronización diferida

- mantiene la captura local cifrada;
- reintenta con la misma llave idempotente;
- soporta cambio de Wi-Fi a datos y viceversa;
- procesa una cola acotada para no saturar batería o red;
- valida checksum antes y después;
- confirma con lectura del recibo;
- evita reenvío por una segunda ruta.

## 7. Protocolo VibePWA -> historias

VibePWA administra historias mediante contratos separados:

- `POST /api/stories`
- `PATCH /api/stories/:id`
- `POST /api/stories/:id/evidence`
- `POST /api/stories/:id/events`
- `POST /api/stories/:id/reorganize`

Estos contratos reciben identificadores de evidencia ya almacenada. No reciben
archivos.

La transacción de historia confirma:

- experiencia;
- eventos;
- vínculos de evidencia;
- antecedentes de reorganización;
- estado narrativo.

Si una parte obligatoria falla, no se presenta la operación como completada.

## 8. Integraciones y APIs externas

Cada proveedor utiliza un adaptador independiente que convierte su formato al
contrato de Capturas o Contexto.

Adaptadores previstos:

- Apple Health / HealthKit;
- Health Connect y Samsung Health;
- Oura API v2;
- Meta Ray-Ban y Oakley;
- clima;
- noticias y entretenimiento;
- agenda/calendario;
- OCR, transcripción y modelos de IA.

Reglas:

- secretos solo en servidor;
- OAuth y tokens cifrados;
- timeout, reintento y circuit breaker por proveedor;
- paginación y cursores persistentes;
- origen y fiabilidad visibles;
- fallo de un proveedor no bloquea guardar la captura;
- sincronización externa y enriquecimiento son jobs independientes.

## 9. Nueva arquitectura de información de VibePWA

La navegación principal se reduce a:

1. **Inicio**
2. **Historias**
3. **Evidencia**
4. **Inteligencia**
5. **Publicar**
6. **Cuenta**

### 9.1 Inicio

- resumen humano del día;
- agenda cercana;
- capturas recientes;
- historias en progreso;
- señales contextuales relevantes;
- acciones claras.

No muestra colas, versiones, proveedores, porcentajes técnicos ni preparación de
piloto.

### 9.2 Historias

Integra:

- crear historia;
- editor visual;
- Librería;
- mapa;
- reorganización;
- línea de tiempo.

### 9.3 Evidencia

Galería visual unificada:

- imágenes con miniatura;
- videos con fotograma y reproducción;
- audios con reproductor, duración y transcripción;
- textos como tarjetas legibles;
- documentos con portada o vista previa;
- contexto resumido por tiempo.

Los nombres técnicos, rutas y MIME quedan bajo "Detalles técnicos".

### 9.4 Inteligencia

Tabs o modos:

- Reportes
- Hallazgos
- Datos y visualizaciones

Reportes y Hallazgos comparten el mismo selector de alcance descrito en 9.7.

### 9.5 Publicar

- elegir el mismo alcance común;
- elegir evidencia;
- editar narrativa;
- ordenar contenido;
- previsualizar;
- exportar PDF o paquete PDF + multimedia.

Publicar agrega una confirmación visual de historias y activos después de elegir
el alcance. Reportes y Hallazgos pueden analizar automáticamente todo el alcance;
una publicación requiere que el usuario confirme qué contenido formará parte de
la pieza editorial.

### 9.6 Cuenta

- perfil;
- grupos/personas;
- privacidad y datos;
- integraciones;
- ayuda;
- Operación y Administración para usuarios autorizados.

### 9.7 Selector único de alcance

Reportes, Hallazgos y Publicaciones utilizan un solo componente y un solo objeto
de alcance. No mantienen filtros diferentes.

#### Selección principal

1. **Periodo:** fecha inicial y final. Es obligatorio y constituye el eje
   principal porque evidencia, contexto, experiencias y eventos comparten tiempo.
2. **Persona o grupo:** usuario principal, una persona/grupo específico o todos
   los grupos autorizados de la cuenta.
3. **Base de información:**
   - `Todo lo registrado`: historias + evidencia suelta + contexto;
   - `Historias confirmadas`: experiencias, eventos y evidencia vinculada;
   - `Evidencia sin historia`: capturas todavía no organizadas.

#### Filtros opcionales

- Área de vida;
- ubicación;
- tipo de evidencia;
- texto o palabra clave;
- selección explícita de historias;
- selección explícita de activos.

El Área de vida no es obligatoria y no se aplica silenciosamente a evidencia suelta.
Si el usuario elige un área de vida, el sistema analiza historias de esa área de vida
y sus activos vinculados. La evidencia aún no clasificada queda fuera y la
interfaz informa cuántos elementos no fueron incluidos por carecer de área de vida.

#### Contexto y eventos

- Biometría, ubicación, clima y noticias se incorporan automáticamente por
  persona y ventana temporal; no necesitan selección manual en el flujo normal.
- Los eventos se incluyen con su experiencia padre. La selección de eventos
  individuales vive en filtros avanzados.

#### Diferencia entre productos

- **Reporte:** analiza el alcance y presenta métricas, cronología y evidencia.
- **Hallazgos:** usa el mismo alcance para detectar patrones, contrastes y
  próximas acciones.
- **Publicación:** usa el mismo alcance como punto de partida, pero exige una
  selección visual final de contenido antes de generar la pieza.

#### Valores iniciales

- periodo: últimos 7 días;
- persona/grupo: usuario principal o selección activa;
- base: `Todo lo registrado`;
- Área de vida: todas;
- contexto: automático.

El selector muestra una frase humana antes de ejecutar, por ejemplo:

> Analizar los últimos 7 días de Miguel usando historias, evidencia y contexto.

## 10. Editor visual de historias

El editor sustituye el formulario técnico.

### 10.1 Flujo

1. Elegir fecha o rango y persona.
2. Ver evidencia en una galería cronológica.
3. Seleccionar o arrastrar activos.
4. Escribir o dictar título y narrativa.
5. Ordenar activos dentro de la historia.
6. Crear capítulos/eventos solo si aportan valor.
7. Confirmar.

### 10.2 Comportamiento

- miniaturas y vistas previas, no cadenas técnicas;
- selección rápida por fecha;
- sugerencias por cercanía temporal y lugar;
- composición directa entre texto y multimedia;
- diseño responsive para desktop, tablet y móvil;
- teclado y accesibilidad;
- deshacer antes de guardar;
- confirmación visible de cada operación.

## 11. Energía y biometría

Se retira "energía" como indicador principal mientras no exista una definición
confiable y explicable.

Se muestran datos directos:

- frecuencia cardíaca;
- pasos;
- actividad;
- sueño disponible;
- recuperación disponible;
- estado emocional indicado por el usuario.

Una estimación futura:

- requiere cobertura mínima;
- omite variables ausentes;
- explica fuentes y ventana temporal;
- nunca reemplaza ausencia con cero;
- vive en Inteligencia, no como verdad central del Inicio.

## 12. Estrategia de migración sin romper producción

### Fase 0. Congelación y protección

- desactivar el canario defectuoso;
- conservar V1 estable para uso real;
- respaldar Supabase y Storage;
- registrar incidentes y datos de prueba;
- prohibir despliegues parciales del nuevo flujo.

### Fase 1. Caracterización

- inventariar todas las rutas, escritores, tablas, jobs y pantallas;
- registrar botones y funciones como conservar, simplificar, mover o eliminar;
- identificar código muerto y documentación contradictoria;
- fijar métricas base de rendimiento y errores.

### Fase 2. Núcleo de capturas paralelo

- construir Servicio de Capturas, Evidencia y Contexto en módulos nuevos;
- crear outbox móvil durable y recibo de servidor;
- usar tablas o columnas canónicas sin duplicar la fuente de verdad;
- ejecutar pruebas de integración contra un entorno Supabase controlado;
- no conectar todavía a la UI principal.

### Fase 3. Corte móvil controlado

- Vibeapp envía únicamente capturas;
- validar texto, imagen, video, audio, documento y contexto;
- validar modo sin señal, reinicio, duplicado y agotamiento de reintentos;
- habilitar un usuario canario;
- comparar inventario local y remoto.

### Fase 4. Historias y editor visual

- construir el editor visual en paralelo;
- conectar galería de evidencia;
- implementar creación, eventos y reorganización;
- probar historias sin evidencia, con evidencia y con capítulos;
- mantener la UI anterior disponible solo hasta aprobar equivalencia.

### Fase 5. Inteligencia y publicación

- adaptar reportes, hallazgos y publicaciones a evidencia, historias o ambos;
- validar PDF, ZIP y multimedia;
- verificar que datos sin historia sigan aportando valor;
- verificar que Obsidian reciba solo historias confirmadas.

### Fase 6. Limpieza y reemplazo

- consolidar la navegación de producto en seis espacios;
- mover opciones contextuales fuera del menú principal;
- aislar controles técnicos y destructivos en Cuenta > Operación;
- borrar UI muerta y estilos sin uso cuando una prueba confirme que no tienen
  consumidores;
- mantener rutas antiguas mientras Vibeapp dependa de ellas;
- retirar escritores duplicados solo después de habilitar y validar la ruta
  canónica de capturas;
- dividir `app.js` y `server.js` por módulos después de estabilizar los
  contratos activos;
- actualizar caché PWA, manual y documentación canónica;
- cerrar documentación obsoleta con referencia al documento canónico.

## 13. Estrategia de pruebas

### 13.1 Niveles

1. Unitarias: reglas puras.
2. Contrato: payloads y respuestas.
3. Integración: servidor + Supabase + Storage reales de prueba.
4. E2E web: navegador real.
5. E2E móvil: iPhone/iPad y Android emulado o físico.
6. Resiliencia: fallos inducidos.
7. Aceptación: usuario real, lenguaje humano y resultado visible.

### 13.2 Matriz mínima por tipo de captura

Cada tipo prueba:

- conexión normal;
- sin señal y sincronización posterior;
- interrupción durante envío;
- respuesta 4xx;
- respuesta 5xx;
- timeout;
- reinicio de app;
- duplicado con misma llave;
- archivo grande permitido;
- archivo inválido;
- cambio de dispositivo;
- aislamiento entre usuarios.

Tipos:

- texto;
- imagen;
- video;
- audio;
- documento;
- biometría;
- ubicación;
- clima/noticia;
- agenda;
- fuentes Meta;
- Oura/Health.

### 13.3 Puertas de liberación

#### Puerta A: integridad

- cero pérdidas;
- cero duplicados;
- cola conserva fallos;
- recibo verificable;
- inventario local y remoto reconciliado.

#### Puerta B: historias

- evidencia no crea historia por sí sola;
- historia no vuelve a subir evidencia;
- eventos son opcionales;
- reorganización conserva antecedentes.

#### Puerta C: experiencia de usuario

- cinco tareas principales completables sin instrucciones técnicas;
- ningún botón sin resultado;
- ningún panel de operación en flujo cotidiano;
- validación visual desktop, tablet y móvil;
- cuatro idiomas completos.

#### Puerta D: inteligencia

- alcance coherente;
- datos faltantes no inventados;
- gráficos con nombres y leyendas;
- PDF y multimedia correctos;
- Obsidian consistente.

#### Puerta E: operación

- logs y métricas;
- alertas;
- rollback probado;
- manuales vigentes;
- despliegue reproducible.

## 14. Documentación canónica

Se conservará una sola jerarquía:

1. **Blueprint de producto:** propósito, actores y capacidades.
2. **Arquitectura técnica:** componentes, datos y secuencias.
3. **Contratos API/OpenAPI:** entradas, respuestas y errores.
4. **ADRs:** decisiones y razones.
5. **Manual de usuario:** tareas visuales y lenguaje simple.
6. **Manual de operación:** despliegues, monitoreo, respaldo y recuperación.
7. **Catálogo E2E:** escenarios y evidencia de aprobación.
8. **Registro de brechas:** pendientes reales.
9. **Matriz de compatibilidad:** dispositivos y proveedores.

Documentos anteriores se marcarán como históricos o serán absorbidos. Ninguna
nota temporal puede cambiar el contrato sin actualizar el documento canónico.

## 15. Orden de ejecución

1. Aprobar este plan y congelar decisiones centrales.
2. Completar inventario de arquitectura, UI y documentación.
3. Diseñar contratos y modelo de datos final.
4. Implementar núcleo de Capturas en paralelo.
5. Certificar integridad y sincronización.
6. Implementar nueva navegación y editor visual.
7. Adaptar inteligencia, publicaciones y Obsidian.
8. Limpiar código y retirar rutas antiguas.
9. Consolidar manuales y blueprint.
10. Ejecutar aceptación final y corte.

## 16. Definición de terminado

La reestructuración termina cuando:

- Vibeapp solo captura;
- ninguna captura puede desaparecer;
- VibePWA es el único dueño de historias;
- la evidencia aporta valor con o sin historia;
- la interfaz principal es visual y comprensible;
- operación y administración están aisladas;
- APIs e integraciones son observables y resilientes;
- E2E reales cubren rutas felices y fallos;
- documentación funcional y técnica coincide con producción;
- no permanecen rutas, botones ni versiones antiguas activas.
