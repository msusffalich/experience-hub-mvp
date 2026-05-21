# Auditoría UX/UI - Experience Hub

Versión base: 20260521-admin-manual-cleanup-359

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
- Activos muestra primero galería, filtros y revisión visual. Inventarios, CSV, importación, auditoría y plan de procesamiento quedan plegados como herramientas avanzadas.
- Agenda muestra primero calendario, lista y formulario. Importar/exportar .ics y días bloqueados quedan en opciones avanzadas.
- Reportes mantiene una secuencia única: preparar alcance, generar/leer y exportar/cerrar.
- Publicaciones muestra primero generar, editar y exportar. Controles editoriales, historial, guía de salida y paquete quedan plegados.
- Administración queda reorganizada por acordeones temáticos: Resumen ejecutivo, Persistencia/Supabase, Personas/piloto, Perfil/dispositivos, Calidad/cierre y Diagnóstico técnico avanzado.
- El Manual muestra la versión vigente, una tarjeta de orientación y bloques de entrada rápida para entender la estructura antes de leer secciones detalladas.

## Reglas para los próximos cambios

- Principio base: simple por fuera, sofisticada por dentro.
- No agregar nuevos paneles al Panel si son diagnósticos, preparación o monitoreo.
- Todo botón que ejecute una acción debe dejar confirmación visible: guardado, pendiente, resuelto, exportado o error accionable.
- Si una acción abre otra vista, el texto del botón debe decirlo explícitamente.
- No duplicar estados del mismo flujo en dos secciones visibles para el usuario.
- Administración puede tener detalle técnico; Panel, Captura, Librería, Reportes y Publicaciones deben usar lenguaje simple.
- Administración debe mantener agrupación temática y evitar volver a una lista vertical sin jerarquía.
- El Manual debe indicar siempre la versión vigente y separar orientación práctica de detalle técnico.

## Limpieza pendiente por página

- Librería: revisar acciones dentro de cada tarjeta y confirmación de edición/eliminación.
- Activos: seguir evaluando si las herramientas avanzadas deben moverse por completo a Administración.
- Reportes: reducir texto de ayuda si el usuario ya completó el flujo.
- Publicaciones: revisar visualmente los diseños y el ajuste en móvil.
- Agenda: mejorar confirmaciones de creación, actualización y alcance por participante.
