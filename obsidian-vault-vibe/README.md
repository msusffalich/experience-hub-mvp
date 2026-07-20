# Vibe Obsidian Vault

Esta boveda esta preparada para recibir exportaciones Markdown desde VibePWA y convertirlas en una base de conocimiento navegable.

## Principio de trabajo

Inspirado en el enfoque de trabajo publico y aprendizaje activo asociado a Andrej Karpathy:

- Capturar primero, ordenar despues.
- Una nota importante debe contener una idea clara.
- Enlazar experiencias, personas, lugares, activos y aprendizajes.
- Convertir observaciones repetidas en mapas de contenido.
- Mantener notas accionables: pregunta, evidencia, conclusion y siguiente paso.
- Separar dato crudo, interpretacion y publicacion final.

## Estructura

- `00_Inbox`: entradas nuevas sin procesar.
- `01_Daily`: notas diarias y bitacora de contexto.
- `02_Experiences`: experiencias completas exportadas desde Vibe.
- `03_Events`: eventos internos dentro de experiencias largas.
- `04_Assets`: referencias a imagenes, videos, audio, documentos y biometria.
- `10_Atomic_Notes`: ideas atomicas, patrones y aprendizajes.
- `20_Maps_of_Content`: mapas principales para navegar la boveda.
- `30_Projects`: proyectos activos, decisiones y seguimiento.
- `40_Publications`: publicaciones, reportes y paquetes editoriales.
- `50_Reference`: fuentes externas, articulos, notas de investigacion.
- `80_Templates`: plantillas para notas consistentes.
- `90_System`: reglas, contratos de integracion y mantenimiento.

## Uso recomendado

1. Exporta desde VibePWA a Markdown.
2. Guarda el archivo en `00_Inbox` o directamente en `02_Experiences`.
3. Revisa las notas nuevas una vez al dia.
4. Extrae aprendizajes a `10_Atomic_Notes`.
5. Actualiza mapas en `20_Maps_of_Content`.
6. Usa `40_Publications` para piezas listas para PDF, reportes o narrativas.

## Integracion futura con VibePWA

El backend podra guardar automaticamente el Markdown cuando se configure:

```text
OBSIDIAN_VAULT_PATH=C:\ruta\a\tu\vault\obsidian-vault-vibe
```

Hasta entonces, esta carpeta funciona como boveda base transferible.
