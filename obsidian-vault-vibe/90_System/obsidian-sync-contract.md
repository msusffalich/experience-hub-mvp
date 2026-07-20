# Contrato de sincronizacion VibePWA -> Obsidian

## Objetivo

Permitir que VibePWA guarde exportaciones Markdown directamente en esta boveda.

## Variable de entorno futura

```text
OBSIDIAN_VAULT_PATH=C:\ruta\a\obsidian-vault-vibe
```

Si la variable no existe, VibePWA usa la boveda local `./obsidian-vault-vibe`.

En Railway o cualquier servidor productivo, esta ruta debe apuntar a un volumen persistente si se desea conservar los Markdown despues de redeploys.

## Rutas sugeridas

- Mapa de experiencias: `20_Maps_of_Content/MOC - Vibe.md`
- Experiencias completas: `02_Experiences/`
- Eventos internos: `03_Events/`
- Activos: `04_Assets/`
- Publicaciones: `40_Publications/`
- Notas sin clasificar: `00_Inbox/`

## Politica de nombres

Usar nombres seguros:

```text
YYYY-MM-DD - titulo-corto.md
```

## Reglas

- No sobrescribir una nota existente sin crear version o actualizar bloque controlado.
- Mantener enlaces internos tipo `[[Nota]]`.
- Guardar datos tecnicos en frontmatter cuando sea util.
- Separar texto narrativo de metadatos.
- No copiar archivos pesados a Obsidian si ya existen en Storage; usar referencia.

## Siguiente paso tecnico

Agregar en VibePWA un endpoint backend:

```text
POST /obsidian/export
```

Estado: implementado como salida no bloqueante para exportaciones Markdown.

Payload minimo:

```json
{
  "target": "experiences",
  "filename": "2026-07-20 - experiencia.md",
  "markdown": "# Titulo..."
}
```

Respuesta esperada:

```json
{
  "ok": true,
  "path": "02_Experiences/2026-07-20 - experiencia.md"
}
```
