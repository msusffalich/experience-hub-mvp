# Handcheck de curación: dividir y degradar

Objetivo: comprobar con datos reales que ambas operaciones reorganizan historias sin pérdida, duplicación ni notas huérfanas.

## Preparación común

1. Inicia sesión con la misma cuenta en Vibeapp y VibePWA.
2. Confirma que VibePWA muestra la versión publicada y estado sincronizado.
3. Crea dos historias temporales con narrativa real y evidencia fácil de reconocer: `Prueba dividir` y `Prueba destino`.
4. Anota sus títulos, horarios y cantidad de activos antes de modificar nada.

## Prueba A: dividir una historia

1. En `Prueba dividir`, usa **Librería > Organizar > Dividir esta historia**.
2. Elige una hora interior, nunca el inicio ni el final del rango.
3. Confirma la división y abre las dos historias nuevas.

Resultado esperado:

- Nacen dos historias editables, cada una con rango temporal válido.
- La historia original queda como antecedente `split`; no aparece en los conteos activos de Librería, Reportes, Hallazgos, Publicaciones ni Mapa.
- La narrativa y los eventos se asignan a la parte correspondiente; no se copian íntegramente en ambas sin motivo.
- Cada activo sigue existiendo una sola vez y conserva un único vínculo activo.
- En Obsidian, la nota antecedente enlaza a las dos historias sucesoras; las notas activas no duplican texto humano ni multimedia.

## Prueba B: degradar una historia a evento

1. En `Prueba dividir` o una historia menor, usa **Librería > Organizar > Transformar esta historia en evento**.
2. Selecciona `Prueba destino` como experiencia padre y confirma.
3. Abre `Prueba destino` y revisa sus eventos y activos.

Resultado esperado:

- La historia menor deja de contarse como experiencia activa.
- Su narrativa pasa a un evento de `Prueba destino`, con hora, título y evidencia vinculada.
- Los activos se mueven al evento o a la experiencia padre sin duplicarse ni borrarse.
- La historia original queda como antecedente `degraded` enlazado a la experiencia padre.
- Reportes, Hallazgos, Publicaciones, Mapa y exportación Obsidian muestran una sola historia activa.

## Cierre

1. Exporta la bóveda Obsidian y pide a Claude PC validar antecedentes, enlaces, activos y ausencia de duplicados.
2. En VibePWA revisa Librería, Reportes y Publicaciones con el mismo filtro de fecha.
3. Borra únicamente las historias temporales si la prueba fue correcta. No borres activos de otras historias ni señales de contexto.

## Resultado a registrar

Para cada prueba: versión VibePWA, fecha/hora, historia origen, historia destino, cantidad de activos antes/después, resultado en Obsidian y cualquier mensaje de error.
