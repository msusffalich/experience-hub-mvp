# Auditoría UX/UI - Experience Hub

Versión base: 20260521-dashboard-ux-cleanup-357

## Criterio rector

La aplicación debe separar claramente dos modos:

- Usuario diario: acciones simples, lectura clara, captura, consulta, reporte y revisión.
- Administración: monitoreo, diagnósticos, colas, sincronización, adjuntos pendientes, piloto, preparación técnica y evidencias de operación.

## Hallazgos corregidos en esta versión

- El Panel mostraba estados de adjuntos y preparación del piloto junto a información de uso diario.
- Había señales contradictorias: un bloque indicaba que no había pendientes mientras otro mostraba pendientes.
- Las acciones de reparación generaban notificaciones duplicadas y no quedaban confirmadas en un solo lugar.
- El Panel tenía demasiados bloques de seguimiento operativo para un usuario común.

## Decisiones aplicadas

- El Panel queda enfocado en acciones principales, métricas, Agenda, señales recientes, Diario y análisis contextual.
- Estados técnicos de adjuntos, piloto, colas y diagnósticos quedan en Administración.
- Las acciones principales del Panel son: Nueva experiencia, Ver Librería, Ver Activos y Generar reporte.
- La reparación de adjuntos queda como estado administrativo, no como monitoreo visible del Panel.
- Captura queda como formulario único. Guías de calidad, corrección gramatical y plantillas rápidas no compiten visualmente con guardar una experiencia.

## Reglas para los próximos cambios

- Principio base: simple por fuera, sofisticada por dentro.
- No agregar nuevos paneles al Panel si son diagnósticos, preparación o monitoreo.
- Todo botón que ejecute una acción debe dejar confirmación visible: guardado, pendiente, resuelto, exportado o error accionable.
- Si una acción abre otra vista, el texto del botón debe decirlo explícitamente.
- No duplicar estados del mismo flujo en dos secciones visibles para el usuario.
- Administración puede tener detalle técnico; Panel, Captura, Librería, Reportes y Publicaciones deben usar lenguaje simple.

## Limpieza pendiente por página

- Librería: revisar filtros, acciones repetidas y confirmación de edición.
- Activos: separar uso normal de auditoría multimodal avanzada.
- Reportes: dejar una secuencia única de generar, revisar y exportar.
- Publicaciones: reducir opciones iniciales y mostrar edición/resultado final con claridad.
- Agenda: confirmar creación, actualización y alcance por participante sin saltos innecesarios.
