# Protocolo de coordinacion entre agentes

Estado: vigente desde 2026-07-26

## Objetivo

Evitar que Miguel tenga que actuar como mensajero entre Codex PC, Claude PC y Claude MAC, y eliminar cambios ambiguos de carpeta durante un handcheck.

## Roles

- Codex PC: VibePWA, servidor, documentacion y despliegue final.
- Claude PC: auditoria de Obsidian, mapa de experiencias y curaduria de la boveda.
- Claude MAC: Vibeapp, iPhone/iPad, captura nativa e integracion de dispositivos.
- Miguel: orquestador de prioridades y aceptacion final; no es mensajero tecnico.

## Buzon canonico

La unica carpeta de intercambio entre agentes es:

`C:\Users\msusf\OneDrive\HANDCHECK`

Reglas obligatorias:

1. Toda solicitud, respuesta, hallazgo o cierre dirigido a otro agente se deja en esa carpeta.
2. Ningun agente cambia la carpeta de intercambio sin una decision explicita de Miguel.
3. Las copias dentro de `docs/`, del repositorio o del workspace son archivo tecnico interno; no sustituyen el handcheck de OneDrive.
4. Antes de informar que una respuesta esta lista, el agente confirma que el archivo existe en la ruta canonica.
5. Si una sesion no tiene permiso para escribir en OneDrive, debe decirlo con claridad y entregar una unica instruccion de traslado. No debe inventar otra carpeta como nuevo canal.

## Nombre de archivos

Usar un nombre descriptivo y estable:

`AAAA-MM-DD_ORIGEN_DESTINO_TEMA.md`

Ejemplo:

`2026-07-26_CODEX-PC_CLAUDE-MAC_PIPELINE-V2.md`

Una respuesta puede conservar el nombre recibido con el prefijo `RESPUESTA_` cuando eso facilite seguir la conversacion.

## Regla de trabajo

1. Antes de actuar, cada agente lee las notas nuevas de `C:\Users\msusf\OneDrive\HANDCHECK`.
2. Cada nota indica el objetivo exacto del intercambio o de la prueba.
3. El agente documenta causa confirmada, cambio realizado, prueba ejecutada, resultado y pendiente.
4. No se aceptan conclusiones basadas solo en "parece" o "probablemente".
5. Si un agente necesita informacion de otro, la solicita en el buzón canonico, sin usar a Miguel como traductor.
6. Codex PC conserva la responsabilidad del despliegue final del servidor y VibePWA.

## Formato minimo

```md
## Handcheck

Fecha:
Origen:
Destino:
Version:
Objetivo:

### Entrada leida

### Accion realizada

### Evidencia y pruebas

### Resultado

### Pendiente para el destinatario
```

## Regla de cierre

Un tema se cierra solo cuando:

- existe una prueba en dispositivo o servidor real;
- el resultado esperado aparece en VibePWA o Vibeapp;
- pasan las pruebas automatizadas aplicables;
- y la nota final del buzon canonico declara `Estado: cerrado`.
