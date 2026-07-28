# Documentación vigente de Vibe

Este índice separa las referencias actuales de los diagnósticos e handchecks
históricos. Si dos documentos difieren, manda el documento canónico de esta
lista y después el código validado de la versión publicada.

## Producto y uso

- `manual-usuario-vibe-20260723.md`: manual integral para usuarios.
- `blueprint-produccion-ecosistema-vibe-20260723.md`: visión completa del
  ecosistema, arquitectura y procesos.
- `plan-maestro-reestructuracion-ecosistema-vibe-20260726.md`: plan de
  reestructuración y estado de cada fase.

## Arquitectura y operación

- `arquitectura-v2-evidencia-vibeapp-servidor.md`: canal canónico de captura y
  evidencia.
- `vibe-operating-contract-20260727.md`: responsabilidades entre Vibeapp,
  VibePWA, API y almacenamiento.
- `vibeapp-vibepwa-operating-contract.md`: compatibilidad de integración entre
  las dos aplicaciones.
- `capture-adoption-blueprint-20260721.md`: captura, adopción y curación.
- `experience-model-glossary-20260723.md`: términos de experiencia, evento,
  evidencia, contexto y Área de vida.
- `guia-arquitectura-y-flujos-por-activo-20260727.md`: comportamiento por tipo
  de activo y escenarios sin conexión.

## Evidencia de entrega

Los archivos `handcheck-*`, auditorías, registros de brechas y guías de prueba
son evidencia histórica. Sirven para rastrear una corrección, pero no definen la
interfaz actual ni sustituyen al manual o al blueprint.

`inventory-restructure-20260727.md` se regenera con
`npm run audit:restructure` y enumera la superficie técnica actual. No es un
manual.
