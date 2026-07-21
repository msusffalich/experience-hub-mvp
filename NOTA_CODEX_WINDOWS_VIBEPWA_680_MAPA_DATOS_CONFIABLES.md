# NOTA CODEX WINDOWS - VibePWA 680 - Mapa con datos confiables

Fecha: 2026-07-21

## Objetivo

Cerrar los dos pendientes detectados despues de la exportacion correcta a la boveda Obsidian:

1. El mapa no debia contar narrativa real con una regla distinta a la de las notas.
2. El resumen ejecutivo del mapa no debia afirmar energia media ni categoria dominante cuando esos datos provenian de defaults o clasificaciones no confiables.

## Cambios aplicados

- Se agrega `getExperienceEnergyForKnowledge`.
- Se agrega `getExperienceCategoryForKnowledge`.
- El mapa usa energia analitica solo cuando la experiencia tiene fuente explicita y no parece valor tecnico default.
- El mapa usa categoria dominante solo cuando la experiencia tiene fuente explicita de categoria.
- Si no hay energia confiable, el mapa escribe `sin dato suficiente`.
- Si no hay categoria confiable, el mapa escribe `sin dato confiable`.
- La metrica `Experiencias con narrativa real` queda atada a `getExperienceNarrativeStatus`, la misma regla que usan las notas de experiencia.
- El verificador Obsidian ahora falla si se pierde esta separacion entre valores crudos/default y valores confiables para analisis.

## Validacion esperada en Obsidian

Despues del deploy y reexportacion:

- El mapa debe caer en `05_Generated/mapa-de-conocimiento-vibe-obsidian.md`.
- Las notas deben caer en `02_Experiences`.
- `Experiencias con narrativa real` debe coincidir con las notas que tienen `narrative: "ok"`.
- El resumen no debe decir `Categoria dominante: Trabajo` si no hay fuente confiable.
- El resumen no debe decir `Energia media registrada: 5.x/10` si viene de valores default 5/7 sin fuente confiable.
