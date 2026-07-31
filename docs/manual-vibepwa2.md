# Manual integral de usuario - VibePWA 2

Estado: manual canónico de producto

Versión interactiva: `apps/vibepwa-next/manual.html`

Idiomas de la versión interactiva: ES, EN, FR y PT

## 1. Qué es Vibe

Vibe es un ecosistema para registrar hechos multimodales, convertirlos en
historias cuando el usuario lo desea y obtener reportes, hallazgos,
publicaciones y conocimiento útil.

Sus componentes comparten la misma cuenta y la misma fuente de información:

| Componente | Función |
| --- | --- |
| Vibeapp | Captura inmediata desde teléfono o tableta |
| VibePWA 2 | Historias, evidencia, inteligencia, publicaciones y cuenta |
| Servidor Vibe | Identidad, sincronización, almacenamiento y servicios |
| Supabase | Datos estructurados y archivos privados |
| Obsidian | Curaduría y exploración del mapa derivado |
| Vibepub/MagStudio | Edición editorial posterior |

Los lentes Meta, relojes, Oura y otras fuentes aportan evidencia o contexto. No
crean por sí solos una historia.

## 2. La idea principal

Vibe separa dos actividades que suelen ocurrir en momentos diferentes.

### Capturar

Vibeapp permite guardar rápidamente:

- texto;
- voz;
- foto;
- video;
- documento;
- ubicación;
- biometría;
- clima, noticias y agenda;
- señales de dispositivos compatibles.

El usuario no tiene que definir una experiencia antes de capturar. El contenido
queda seguro y puede esperar en la bandeja.

### Contar una historia

VibePWA 2 permite revisar la evidencia de forma visual, seleccionar la que
pertenece al mismo episodio y contar qué ocurrió. La historia puede crearse
horas o días después sin cambiar la fecha real de los hechos.

La evidencia no elegida:

- no se borra;
- no se convierte en experiencia automáticamente;
- sigue disponible para análisis, publicaciones o uso posterior.

## 3. Ruta rápida

1. Captura el hecho en Vibeapp.
2. Abre Evidencia en VibePWA 2.
3. Revisa miniaturas, reproductores y extractos.
4. Crea una historia cuando quieras darle sentido.
5. Usa Inteligencia para reportes y hallazgos.
6. Usa Publicar para generar PDF o un paquete con videos.
7. Exporta historias confirmadas a Obsidian cuando quieras trabajar el mapa de
   conocimiento.

## 4. Inicio

Inicio presenta una lectura breve del estado de la cuenta:

- historias recientes;
- evidencia pendiente de organizar;
- actividad y contexto disponible;
- accesos directos a las tareas principales.

No debe funcionar como panel técnico. Los diagnósticos viven en Cuenta.

## 5. Historias

Una historia representa un episodio vivido con sentido.

### Crear

1. Abre Historias.
2. Selecciona Nueva historia.
3. Escribe un título breve.
4. Cuenta qué ocurrió con tus palabras.
5. Confirma fecha o período.
6. Elige persona o grupo.
7. Elige el área de vida cuando corresponda.
8. Selecciona visualmente la evidencia.
9. Añade eventos opcionales.
10. Guarda.

### Narrativa humana

Narrativa es lenguaje humano que cuenta qué se vivió:

- texto escrito por la persona;
- voz transcrita;
- narración hablada dentro de un video.

No es narrativa:

- nombre de archivo;
- OCR;
- descripción automática de una imagen;
- biometría;
- ubicación;
- clima;
- texto de relleno.

El contexto puede enriquecer una historia, pero no sustituye la voz del usuario.

### Eventos

Los eventos son submomentos opcionales con significado propio. Una historia
puede tener:

- narrativa general;
- narrativa en uno o varios eventos;
- ambas.

### Reorganizar

VibePWA permite:

- añadir o quitar evidencia;
- unir historias;
- dividir una historia;
- convertir un evento en historia;
- mover una historia como evento de otra;
- eliminar una historia y devolver sus activos a la bandeja.

Quitar una evidencia de una historia no borra el archivo original.

## 6. Áreas de vida, estados y lugares

El término único para clasificar actividad es **área de vida**.

Áreas narrables:

- Trabajo;
- Paseo;
- Aprendizaje;
- Social;
- Entretenimiento;
- Creatividad;
- Espiritualidad;
- Salud, cuando existe una vivencia;
- Compras, cuando existe una vivencia significativa.

Bienestar es un estado. Hogar es un lugar. Pueden describir una historia, pero
no son áreas de actividad.

## 7. Evidencia multimodal

La galería presenta:

| Tipo | Presentación |
| --- | --- |
| Imagen | Miniatura y fecha |
| Video | Miniatura, duración y reproducción |
| Audio | Controles y transcripción disponible |
| Texto | Extracto legible |
| Documento | Icono, nombre y resumen |
| Biometría | Métricas, fuente y hora |
| Contexto | Resumen claro, fecha y procedencia |

### Estados

- **Por organizar:** guardada, todavía sin historia.
- **Vinculada:** forma parte de una historia.
- **Enviando:** transferencia en curso.
- **Se enviará después:** permanece en el dispositivo.
- **Reintentando:** hubo una falla temporal.
- **Requiere atención:** el original está protegido, pero necesita revisión.

## 8. Grupos y personas

La cuenta pertenece siempre al usuario autenticado. Los grupos o personas
sirven para separar contextos como:

- familia;
- viaje;
- proyecto;
- equipo;
- seguimiento de otra persona autorizada.

El usuario principal crea y administra sus grupos desde Cuenta. Vibeapp permite
seleccionar el grupo activo para las capturas siguientes.

Desactivar un grupo:

- impide usarlo en nuevas capturas;
- lo oculta de los filtros normales;
- conserva historias, evidencia y resultados anteriores.

## 9. Agenda

La agenda representa planificación. Una cita no es una experiencia vivida.

Flujo correcto:

1. Vibeapp registra o recibe la cita.
2. Vibe la muestra como agenda.
3. Después de la actividad, el usuario decide si existe una historia.
4. La cita puede ayudar a completar fecha, lugar y personas.

Vibe nunca inventa un relato a partir de una cita.

## 10. Salud y dispositivos

### Apple Health y HealthKit

Vibeapp es la vía normal para leer Apple Health mediante HealthKit. El usuario
concede permisos por tipo de dato en su iPhone.

VibePWA ofrece importación manual únicamente para:

- respaldo;
- recuperación;
- datos históricos.

### Health Connect y Samsung

En Android, Vibeapp utiliza Health Connect para obtener los datos autorizados.
Es también la vía preferida para relojes Samsung/Galaxy compatibles.

### Oura

Oura se conecta desde `Cuenta > Integraciones`.

1. Selecciona Conectar Oura.
2. Autoriza las categorías deseadas en la página oficial.
3. Regresa a Vibe.
4. Revisa la última sincronización.

Oura puede aportar sueño, frecuencia cardíaca, actividad, recuperación y otras
métricas autorizadas.

### Datos ausentes

Una medición no disponible se omite. Nunca se convierte en cero.

Si no existe lectura de sueño, Vibe puede mostrar otras métricas disponibles,
como pasos, pulso o energía activa, sin penalizar el resultado por la ausencia.

## 11. Ubicación y contexto automático

Con permiso del usuario, Vibeapp aporta la ubicación cercana al momento.

Vibe puede actualizar automáticamente:

- ubicación;
- clima;
- noticias;
- contexto ambiental;
- cartelera de cine;
- teatro;
- conciertos;
- eventos y otros espectáculos vigentes en la ciudad.

Las fuentes y fechas deben ser visibles. Si una fuente falla o el dato no es
reciente, Vibe lo indica y no lo presenta como actual.

El contexto automático no crea historias por sí solo.

## 12. Inteligencia

Reportes y hallazgos parten de un selector común:

1. período;
2. persona o grupo;
3. área de vida, opcional;
4. base de información:
   - todo lo registrado;
   - historias confirmadas;
   - evidencia.

### Reportes

Los reportes ordenan:

- actividad;
- mediciones;
- cobertura por áreas de vida;
- evolución;
- contexto disponible;
- datos faltantes.

Las leyendas de gráficos y colores deben mostrarse completas.

### Hallazgos

Los hallazgos separan:

- observación comprobable;
- interpretación;
- nivel de confianza;
- siguiente acción.

La redacción debe ser clara, humana y sin lenguaje técnico innecesario.

## 13. Publicaciones

Las publicaciones pueden utilizar:

- historias y eventos narrados;
- imágenes;
- videos;
- audios;
- documentos;
- notas;
- mediciones y contexto seleccionados.

### Flujo

1. Define período y persona o grupo.
2. Selecciona historias y evidencia.
3. Revisa orden y título.
4. Genera.

### Descarga

- Sin videos: PDF.
- Con videos: ZIP con PDF y videos relacionados.

Las imágenes deben aparecer con orientación correcta. El PDF organiza el
contenido de forma cronológica y comprensible. Vibe no inventa hechos ni
presenta texto técnico como narrativa.

## 14. Mapa de experiencias y Obsidian

Obsidian recibe una proyección derivada de historias confirmadas.

Puede incluir:

- notas de experiencias;
- eventos con peso propio;
- referencias a activos;
- relaciones entre personas, temas, lugares y aprendizajes.

Biometría, ubicación, clima y otros contextos enriquecen por tiempo, pero no se
convierten en experiencias separadas.

### Curaduría

Cada nota separa:

- zona automática de Vibe;
- zona de curaduría humana.

Una nueva exportación puede regenerar la zona automática, pero preserva los
aprendizajes humanos. Los cambios estructurales de una historia deben hacerse
en VibePWA, no en Obsidian.

## 15. Privacidad

- Cada usuario ve únicamente su cuenta y grupos autorizados.
- Los archivos permanecen privados.
- Las descargas usan enlaces temporales.
- Los permisos de cámara, micrófono, salud y ubicación pueden revocarse.
- Las claves de servicio y tokens de integraciones nunca se muestran al
  usuario.

## 16. Trabajo sin conexión

Cuando no hay señal, Vibeapp:

1. conserva el original;
2. conserva la hora real;
3. espera en una cola local;
4. retoma el envío al recuperar conexión;
5. evita duplicados;
6. elimina el pendiente solo después de la confirmación completa.

Un timeout no significa que el archivo se perdió. Vibe consulta el estado y
continúa con la misma identidad.

## 17. Cuenta, idioma y apariencia

VibePWA 2 ofrece:

- Español;
- English;
- Français;
- Português;
- tema claro;
- tema oscuro.

El idioma cubre navegación, formularios, mensajes, errores, ayuda y operación.
Cambiar idioma o tema no modifica los datos.

## 18. Solución de problemas

### No aparece una captura

1. Revisa Estado en Vibeapp.
2. Confirma si está guardada, enviando o pendiente.
3. En VibePWA abre Evidencia.
4. Quita filtros de fecha, tipo y persona.
5. Si requiere atención, conserva el archivo y abre el detalle.

### No aparecen métricas

1. Confirma permisos del dispositivo.
2. Revisa fecha y persona.
3. Comprueba la última sincronización.
4. Recuerda que un dato ausente no aparece como cero.

### El PDF falla

1. Mantén la sesión abierta.
2. Comprueba la disponibilidad de los archivos.
3. Usa un período menor para identificar el contenido problemático.
4. Anota la versión y el mensaje visible.

### La aplicación parece desactualizada

Usa `Cuenta > Actualizar aplicación`. Esta acción no borra historias ni
archivos.

## 19. Operación y diagnóstico

Esta sección está separada del uso normal. Está destinada a soporte y
administración.

### Revisar

- versión de VibePWA 2;
- versión del contrato;
- disponibilidad del servicio;
- conexión con base de datos;
- conexión con almacenamiento;
- capturas pendientes;
- trabajos fallidos;
- estado de Oura e integraciones;
- último error y etapa confirmada.

### Un servidor verde no basta

Un servidor puede estar encendido y no poder guardar archivos. La operación
completa debe confirmar:

1. servicio;
2. base de datos;
3. almacenamiento;
4. sesión;
5. captura real.

### Pedir soporte

Incluye:

- fecha;
- versión;
- tipo de contenido;
- mensaje visible;
- dispositivo.

No compartas:

- contraseña;
- token;
- claves de Supabase;
- secretos Oura;
- archivos sensibles completos si no son necesarios.

No envíes muchas copias del mismo archivo para resolver un error.

## 20. Impresión y PDF

La versión interactiva incluye:

- índice navegable;
- buscador;
- selector de idioma;
- diseño adaptable a móvil, tableta y escritorio;
- botón `Imprimir o guardar PDF`.

Al imprimir, se ocultan controles y navegación lateral, se conserva el orden de
los capítulos y se prepara el contenido para tamaño A4.

## 21. Regla editorial

Este manual usa lenguaje para usuarios. Los nombres internos de tablas, rutas,
estados técnicos y credenciales solo aparecen en documentación de arquitectura
o en la sección operativa cuando son necesarios para soporte.

Las cuatro versiones de idioma deben mantener el mismo alcance. Una función no
está documentada si solo aparece en uno de los idiomas.
