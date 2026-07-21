# NOTA CODEX WINDOWS - VibePWA 679 - Guard de boveda Obsidian

Fecha: 2026-07-21

## Objetivo

Cerrar el error de exportacion donde VibePWA podia escribir carpetas sueltas `02_Experiences` y `05_Generated` fuera de la boveda real de Obsidian.

## Boveda correcta

La carpeta/boveda correcta es:

```text
C:\Users\msusf\Documents\Codex\2026-05-09\files-mentioned-by-the-user-meta\obsidian-vault-vibe
```

Para Obsidian, una boveda es una carpeta normal que contiene `.obsidian/`. VibePWA ahora usa ese marcador como regla tecnica, no el nombre de la carpeta.

## Cambios aplicados

- VibePWA muestra la ruta completa esperada al usuario.
- La seleccion local se valida por existencia de `.obsidian/`.
- Si el usuario selecciona directamente la boveda correcta, se acepta.
- Si el usuario selecciona una carpeta padre que contiene una unica boveda hija con `.obsidian/`, VibePWA corrige automaticamente hacia esa boveda.
- Si el usuario selecciona una carpeta sin `.obsidian/`, la exportacion se rechaza.
- Si el usuario selecciona una carpeta con multiples bovedas hijas, la exportacion se rechaza por ambigua.
- Antes de escribir cualquier Markdown, VibePWA vuelve a validar que el handle conectado sigue apuntando a una boveda real.
- El check automatico `scripts/verify-obsidian-export-contract.mjs` ahora valida estas reglas.

## Lo que no cambia

- VibePWA no puede escribir directamente en `C:\...` sin permiso del navegador. Chrome/Edge requieren que el usuario conceda permiso a la carpeta al menos una vez.
- VibePWA no borra notas append-only en `02_Experiences`. Solo reporta candidatas obsoletas para revision.
- La boveda no debe vivir dentro del repo de la app.

## Protocolo de prueba

1. Abrir VibePWA version 679.
2. Ir al mapa de experiencias.
3. En el panel Obsidian, elegir `Quitar conexion local` si habia una conexion vieja.
4. Elegir `Conectar boveda del PC`.
5. Seleccionar exactamente:

```text
C:\Users\msusf\Documents\Codex\2026-05-09\files-mentioned-by-the-user-meta\obsidian-vault-vibe
```

6. Ejecutar la exportacion Markdown/Obsidian.
7. Verificar que el mapa quede en:

```text
obsidian-vault-vibe\05_Generated\mapa-de-conocimiento-vibe-obsidian.md
```

8. Verificar que las experiencias queden en:

```text
obsidian-vault-vibe\02_Experiences\
```

9. Verificar que no se creen carpetas sueltas `02_Experiences` ni `05_Generated` en el padre.
