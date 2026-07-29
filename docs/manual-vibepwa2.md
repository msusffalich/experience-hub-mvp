# Manual de usuario - VibePWA 2

## Que es Vibe

Vibe es un ecosistema para conservar hechos de la vida, convertirlos en
historias y obtener reportes, hallazgos, publicaciones y un mapa de
conocimiento.

Sus componentes tienen responsabilidades claras:

- **Vibeapp:** captura inmediata desde telefono o tableta.
- **VibePWA:** organiza evidencia, arma historias y genera resultados.
- **Servidor Vibe:** identidad, sincronizacion, almacenamiento y servicios.
- **Obsidian:** curacion y explotacion del mapa de conocimiento.
- **Vibepub/MagStudio:** edicion editorial posterior cuando se necesita.

Los lentes Meta, relojes, Oura y otras fuentes aportan evidencia o contexto. No
crean por si solos una historia.

## Dos momentos de uso

### Capturar

En el momento vivido, el usuario toma una foto, video, audio, nota o lectura.
La captura conserva su hora y persona. Puede sincronizar de inmediato o esperar
hasta recuperar conexion.

### Dar sentido

Mas tarde, el usuario abre VibePWA, elige evidencia visible y cuenta una
historia. La evidencia no elegida permanece disponible para reportes,
hallazgos o uso posterior.

## Inicio

Muestra solo cuatro indicadores:

- historias;
- activos;
- evidencia por organizar;
- porcentaje de historias con narrativa humana.

Desde aqui se abre una historia reciente o se inicia una nueva.

## Historias

Una historia es un episodio vivido con sentido. Para crearla:

1. escribe un titulo breve;
2. cuenta que ocurrio con tus palabras;
3. elige el area de vida;
4. confirma fecha, lugar y personas;
5. selecciona visualmente fotos, videos, audios o documentos;
6. guarda.

La evidencia queda vinculada sin borrar el archivo original.

### Areas de vida

Trabajo, Paseo, Aprendizaje, Social, Entretenimiento, Creatividad,
Espiritualidad, Salud y Compras.

Bienestar es un estado y Hogar es un lugar; por eso no aparecen como areas de
actividad.

## Evidencia

La galeria muestra cada archivo con vista previa, fecha, tipo y estado:

- **Por organizar:** todavia no pertenece a una historia.
- **Vinculada:** ya forma parte de una historia.

`Añadir evidencia` usa una ruta de almacenamiento directo. El usuario ve
confirmacion solo cuando el archivo y su registro quedaron guardados.

## Inteligencia

Los filtros de texto, area y fechas definen el alcance comun.

- **Reporte:** mediciones, balance por areas, evolucion y contexto disponible.
- **Hallazgos:** patrones redactados en lenguaje humano.
- **Mapa:** abre el flujo de conocimiento y exportacion a Obsidian.

La falta de biometria no se interpreta como cero. Se muestra "Sin dato
suficiente".

## Publicar

El usuario elige historias. Vibe arma un documento cronologico y genera:

- PDF cuando no hay video;
- ZIP con PDF y videos cuando las historias seleccionadas contienen videos.

Las imagenes disponibles se integran en el PDF; los videos se conservan como
archivos reproducibles dentro del paquete.

## Cuenta

Permite elegir:

- Español;
- English;
- Français;
- Português;
- pantalla clara u oscura.

La informacion tecnica esta colapsada en `Operacion y diagnostico`. No es
necesaria para el uso normal.

## Trabajo sin conexion

Vibeapp conserva cada captura hasta recibir confirmacion completa. Si pierde
senal:

1. mantiene el archivo en el dispositivo;
2. reintenta con la misma identidad;
3. reanuda archivos grandes;
4. elimina la copia pendiente solo tras confirmacion.

La fecha de la experiencia sigue siendo la del momento vivido, no la del
reintento.

## Privacidad

Cada usuario ve su propia cuenta y sus grupos. Los archivos se guardan en
Storage privado. Los enlaces temporales se crean solo al visualizar o
descargar.

## Regla de narrativa

Narrativa es lenguaje humano que cuenta que se vivio: texto escrito o voz
transcrita. OCR, vision IA, biometria, GPS y clima son contexto, no narrativa.

Una historia puede contener las dos cosas sin mezclarlas.
