# Guia de Prueba Individual del MVP

Version recomendada: `20260515-supabase-compat-280`

## Objetivo

Probar si el MVP puede tomar experiencias reales desde desktop, organizarlas, analizarlas, reportarlas y dejar evidencia de cierre.

## Antes de empezar

Abre:

`http://localhost:5174/index.html?v=20260515-supabase-compat-280&view=admin`

1. Entra a **Administracion > Cierre operativo del MVP**.
2. Pulsa **Iniciar prueba**.
3. En **Responsable de prueba**, escribe tu nombre o rol.
4. En **Grupo piloto**, escribe `Prueba individual 1`.
5. En notas, escribe `Validacion individual del MVP desde desktop`.
6. Pulsa **Guardar notas**.

## Paso 1: Cargar base de prueba

1. Pulsa **Cargar datos de prueba** si no tienes datos suficientes.
2. Pulsa **Ejecutar prueba central**.
3. Revisa el primer bloqueo que indique la compuerta.

Evidencia sugerida: `Se cargaron datos base y la compuerta central indico el estado inicial del MVP.`

## Paso 2: Crear experiencia real

1. Ve a **Captura**.
2. Crea una experiencia real sencilla.
3. Completa categoria, fecha, duracion, estado de animo, energia, lugar, personas y notas.
4. Adjunta al menos un archivo: foto, audio, video, PDF, Word, TXT o captura de pantalla.
5. En la banda superior, escribe evidencia y pulsa **Guardar evidencia y volver**.

Evidencia sugerida: `Cree una experiencia real con datos propios y adjunte un archivo desde desktop.`

## Paso 3: Verificar libreria

1. Ve a **Libreria**.
2. Busca la experiencia creada.
3. Filtra por categoria o fecha.
4. Abre o edita la experiencia.
5. Confirma que el adjunto aparece asociado.

Evidencia sugerida: `Encontre la experiencia creada, pude revisarla o editarla y confirme que la evidencia quedo vinculada.`

## Paso 4: Verificar activos multimodales

1. Ve a **Activos** o **Libreria de activos**.
2. Busca el archivo adjunto.
3. Revisa el tipo: imagen, audio, video o documento.
4. Agrega o revisa etiquetas, nota, origen, idioma, fecha o analisis manual si aplica.
5. Confirma si se muestra como local, servidor o Supabase.

Evidencia sugerida: `El archivo adjunto aparecio en la libreria de activos con tipo, origen y estado de almacenamiento visibles.`

## Paso 5: Revisar reportes

1. Ve a **Reportes**.
2. Genera o revisa el reporte.
3. Confirma que aparezcan resumen narrativo, hallazgos, indicadores, graficas, categorias y evidencia multimodal si existe.
4. Revisa si el reporte es entendible.

Evidencia sugerida: `El reporte mostro narrativa, indicadores, graficas y evidencia suficiente para interpretar la experiencia.`

## Paso 6: Exportar evidencia

1. Desde **Reportes** o **Administracion**, exporta al menos un formato: JSON, CSV, HTML imprimible, PDF o respaldo local.
2. Confirma que el archivo se genera o que la app registra la exportacion.

Evidencia sugerida: `Genere una exportacion de evidencia y la app registro el resultado para el cierre del MVP.`

## Paso 7: Respaldo y privacidad

1. En **Administracion**, revisa privacidad.
2. Confirma que Supabase esta activo.
3. Ejecuta **Verificar Supabase**.
4. Ejecuta **Probar flujo real** si tienes sesion activa.
5. Genera respaldo si esta disponible.

Evidencia sugerida: `Verifique Supabase, privacidad, Storage y respaldo sin bloqueos criticos para la prueba individual.`

## Paso 8: Cierre de la prueba

1. Regresa a **Administracion > Cierre operativo del MVP**.
2. Confirma que todos los pasos esten completos.
3. Confirma que todas las evidencias esten guardadas.
4. Pulsa **Terminar prueba**.
5. Pulsa **Ejecutar prueba central** otra vez.
6. Revisa si el cierre final se habilita.
7. Exporta **Paquete cierre MD** y **Paquete cierre JSON**.

Evidencia final sugerida: `Complete la prueba individual del MVP desde desktop, con captura, evidencia, libreria, reportes, exportaciones, Supabase y respaldo revisados.`

## Criterios para considerar validado el MVP internamente

- Puedes crear una experiencia real.
- Puedes adjuntar al menos un archivo.
- Puedes encontrarla en Libreria.
- Puedes verla en Activos.
- Puedes generar reporte.
- Puedes exportar evidencia.
- Supabase no muestra bloqueo critico.
- Puedes terminar la sesion de prueba.
- Puedes exportar paquete de cierre.

## Problemas que debes registrar

- No encuentro donde hacer algo.
- Un boton no responde.
- Un texto es confuso.
- Una pantalla queda vacia.
- Un archivo no se ve.
- El reporte no tiene sentido.
- Supabase pide sesion o falla.
- La exportacion no se genera.
- El flujo obliga a navegar demasiado.
