# Handcheck integral: captura, historia y curacion

Fecha: 2026-07-23  
Version VibePWA: `20260723-story-curation-704`  
Responsables: Codex PC (VibePWA/backend), Claude MAC (Vibeapp), Claude PC (Obsidian)  
Estado: listo para validacion cruzada

## Objetivo

Validar un unico recorrido de memoria, sin rutas paralelas ni experiencias
falsas:

`Vibeapp captura -> servidor/Supabase conserva -> VibePWA estructura y cura -> Obsidian refleja`

La fuente unica de verdad es el backend/Supabase. La boveda Obsidian es una
exportacion curada y no una segunda base de datos.

## Preparacion

1. Iniciar sesion con la misma cuenta en Vibeapp y VibePWA.
2. Seleccionar el mismo grupo/persona o dejar el usuario principal.
3. Confirmar en Vibeapp: backend, sesion y cola en estado listo.
4. Confirmar en VibePWA la version `20260723-story-curation-704` y sesion
   sincronizada.
5. Usar nombres temporales: `Prueba historia A` y `Prueba historia B`.

## Parte 1: captura sin historia

1. En Vibeapp tomar una foto sin iniciar experiencia.
2. Confirmar que Vibeapp indica subida correcta, no una experiencia creada.
3. En VibePWA abrir Captura > Bandeja de evidencia y actualizar.

Resultado esperado:

- La foto aparece una vez como `Esperando historia`.
- Tiene fecha/hora y grupo/persona correctos.
- No aparece como experiencia ni como evento de agenda.

## Parte 2: adopcion y relato

1. En VibePWA crear `Prueba historia A` con rango que cubra la foto.
2. Escribir un relato humano en `Que ocurrio`.
3. Seleccionar la foto de la bandeja y guardar.
4. Revisar Libreria y Activos.

Resultado esperado:

- La foto deja de estar en bandeja y queda vinculada a A.
- A conserva el relato; la foto no suplanta la narrativa.
- El activo mantiene un solo archivo y la asociacion correcta.

## Parte 3: curacion en Libreria

Crear `Prueba historia B` en una hora cercana. Abrir `Organizar` en A y validar
una accion por vez.

| Accion | Paso | Resultado esperado |
| --- | --- | --- |
| Mover evidencia | Mover la foto de A a B | La foto cambia de historia; no se duplica ni se borra. |
| Soltar evidencia | Soltar la foto desde B | Vuelve a Bandeja y sigue existiendo en Activos. |
| Fusionar | Adoptar la foto otra vez y unir B dentro de A | A conserva eventos/archivos; B queda como antecedente y no se cuenta en reportes. |
| Dividir | En una historia de 60 minutos, elegir un momento interior | Nacen dos historias editables; la original queda como antecedente. |
| Promover evento | Crear un evento con relato y promoverlo | El evento sale de la historia padre y se vuelve historia independiente. |
| Degradar historia | Elegir una historia menor y moverla como evento a otra | La menor queda como antecedente y aparece como evento en la mayor. |

Reglas de seguridad que deben observarse:

- Cada accion muestra confirmacion antes de modificar datos.
- Una historia reorganizada no se elimina silenciosamente.
- Las historias `merged`, `split` o `degraded` no duplican Libreria, Reportes,
  Hallazgos o Publicaciones.
- Soltar evidencia no borra el binario; solo quita su vinculo narrativo.

## Parte 4: narrativa y contexto

1. En Vibeapp, dentro de una experiencia abierta, crear un evento y contar con
   voz o texto lo que ocurrio.
2. Enviar biometria o ubicacion como una captura independiente.
3. Sin crear historia adicional, abrir VibePWA y refrescar datos.

Resultado esperado:

- `event.narrativeText` llega como lenguaje humano y el evento queda `ok`.
- La experiencia cuenta como narrada si su relato o uno de sus eventos narra.
- Biometria, GPS, clima y noticias quedan como contexto, nunca como experiencia.
- Agenda solo crea o actualiza Agenda; no genera experiencia ni evento vivido.

## Parte 5: exportacion Obsidian

1. Desde Mapa de experiencias ejecutar la exportacion completa a la boveda
   configurada.
2. Claude PC valida archivos reales.

Resultado esperado:

- Las experiencias narradas llegan a `02_Experiences`.
- Los archivos adoptados llegan como activos reales a `04_Assets`.
- El mapa llega a `05_Generated` en el mismo lote que las notas.
- El contexto no genera notas de experiencia.
- La curaduria humana existente se preserva durante una reexportacion.

## Cierre y reporte de cada agente

### Claude MAC

Entregar build, dispositivo probado, capturas de pantalla, resultado de cola y
tres payloads anonimizados: evidencia sin padre, contexto y experiencia con
evento narrado.

### Codex PC

Entregar version VibePWA, resultado de servidor/Supabase, resultado de
Libreria/curacion y estado de despliegue.

### Claude PC

Entregar conteo de notas/activos exportados, validacion de narrativa/rollup y
confirmacion de preservacion de curaduria humana.

## Limpieza

Al terminar, borrar solo las historias temporales `Prueba historia A` y
`Prueba historia B`. No borrar contexto ni activos reales de otras historias.
