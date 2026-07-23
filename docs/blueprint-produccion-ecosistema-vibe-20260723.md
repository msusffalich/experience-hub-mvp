# Blueprint de producción del ecosistema Vibe

Estado: documento canónico de producto y producción  
Fecha: 2026-07-23  
Alcance: Vibeapp, VibePWA, backend/Supabase, Obsidian/Claude PC y VibePub.

## 1. Propósito y resultado esperado

Vibe es un ecosistema para registrar, comprender y reutilizar experiencias humanas. No es una aplicación de archivos ni un tablero de métricas aisladas. Conserva los hechos que el usuario decide registrar, permite convertirlos en historias fieles y usa esa memoria para análisis, reportes, hallazgos y publicaciones.

El producto atiende dos necesidades que comparten la misma base:

1. **Memoria personal y narrativa:** recordar lo vivido, organizar historias, preservar evidencia y aprender de ellas.
2. **Lectura contextual y decisiones:** observar patrones de trabajo, salud, aprendizaje, relaciones y hábitos sin reemplazar el juicio humano ni emitir diagnósticos clínicos.

La regla de diseño es: **capturar no es estructurar**. Una persona puede capturar una foto o una frase en segundos y construir la historia horas o días después.

## 2. Usuarios y superficies

| Usuario | Necesidad | Superficie principal |
| --- | --- | --- |
| Persona que vive el momento | Capturar sin fricción. | Vibeapp. |
| Persona que revisa y organiza | Armar historias, adoptar evidencia y curar memoria. | VibePWA. |
| Persona que analiza su historia | Consultar reportes, hallazgos, publicaciones y mapa. | VibePWA. |
| Curador de conocimiento | Desarrollar aprendizajes y conexiones persistentes. | Obsidian + Claude PC. |
| Editor/distribuidor | Refinar una publicación para otros canales. | VibePub. |
| Operador del producto | Respaldo, recuperación, control de calidad y soporte. | VibePWA > Operación/Administración. |

## 3. Modelo canónico de información

```
Cuenta / persona
  └─ Grupo o persona privada (opcional)
       └─ Experiencia
            ├─ Evento(s) opcional(es)
            ├─ Evidencia intencional adoptada
            └─ Referencias a contexto ambiente
```

### 3.1 Definiciones

- **Experiencia:** episodio vivido con rango de tiempo y significado coherente.
- **Evento:** submomento significativo dentro de una experiencia. Puede tener narrativa, pero no se transforma automáticamente en experiencia.
- **Evidencia intencional:** foto, video, audio, texto, documento u otro archivo capturado o elegido por la persona.
- **Contexto ambiente:** biometría, GPS, clima, noticias, entretenimiento y datos de agenda por fecha/hora.
- **Narrativa humana:** lenguaje de la persona contando lo que vivió. Texto escrito, voz transcrita o voz de video narrado.
- **Artefacto:** algo producido o recopilado, por ejemplo un informe o paper. Puede adjuntarse a una experiencia, pero no es su narrativa por defecto.

La definición completa de narrativa vive en `obsidian-vault-vibe/90_System/definicion-narrativa-humana.md`. El contrato de implementación equivalente está en `docs/capture-adoption-blueprint-20260721.md` y no puede contradecirla.

## 4. Arquitectura funcional

### 4.1 Vibeapp: capturar primero

Vibeapp es la aplicación Flutter para teléfono y tableta. Su interfaz está optimizada para el momento: texto, voz, cámara, galería, video, documentos, ubicación y datos del dispositivo.

Responsabilidades:

- Capturar evidencia rápida, aun sin historia padre.
- Asociar cuenta y grupo/persona activos.
- Mantener cola local, reintento e idempotencia.
- Obtener contexto móvil permitido: ubicación, biometría, clima, noticias y conectores de dispositivos.
- Enviar señales normalizadas al backend y comunicar éxito, espera o acción requerida en lenguaje simple.

Límites deliberados:

- No administra grupos, usuarios ni bajas de cuenta.
- No realiza curación compleja: no fusiona/divide historias ni mueve evidencia entre varias historias.
- No convierte contexto técnico en experiencia por su cuenta.

### 4.2 VibePWA: estructurar y comprender

VibePWA es la aplicación web para revisión, curación, análisis y operación.

Responsabilidades:

- Mostrar Bandeja de evidencia y permitir adopción por fecha, rango, grupo/persona o selección explícita.
- Crear experiencias y eventos con narrativa humana.
- Curar historias: mover/soltar evidencia, fusionar, dividir, promover eventos y degradar una experiencia a evento.
- Mostrar Librería, Activos, Agenda, Mapa, Reportes, Hallazgos, Publicaciones, Manual y controles operativos.
- Exportar a Obsidian y generar PDFs editados.

### 4.3 Backend y Supabase: fuente única de verdad

El backend Node y Supabase son el registro común. Ninguna UI mantiene una segunda versión canónica de experiencias.

Componentes:

- Supabase Auth para sesión e identidad.
- Postgres con protección por usuario/workspace para experiencias, eventos, activos, agenda, contexto y auditoría.
- Storage privado para multimedia; las vistas usan URLs firmadas temporales.
- API Node para captura, sincronización, media binaria, integraciones, PDFs y exportación.
- Railway para despliegue de la API y generación ReportLab.

La aplicación responde rápido al guardar. Enriquecimientos lentos, como clima, noticias o impacto ambiental, se ejecutan después y se registran con éxito, reintento o fallo visible para Operación.

### 4.4 Obsidian y Claude PC: conocimiento, no segunda base

Obsidian es una exportación curada para revisar aprendizajes, conexiones y memoria de largo plazo.

- `02_Experiences`: experiencias narradas exportables.
- `04_Assets`: archivos reales adoptados, organizados por familia multimedia.
- `05_Generated`: mapas, resúmenes y productos regenerables.
- `90_System`: contratos conceptuales, auditorías y guías de la bóveda.

La exportación es atómica: las notas y el mapa pertenecen al mismo lote. Conserva el bloque humano de cada nota y actualiza solo el bloque generado. Una historia reorganizada se conserva como antecedente `merged`, `split` o `degraded`; no cuenta como experiencia activa ni se borra automáticamente.

Claude PC audita la bóveda y propone curación humana. No escribe como fuente de verdad del producto.

### 4.5 VibePub: edición y distribución posterior

VibePWA construye el PDF editorial con relatos, evidencia y cronología. VibePub es el entorno para refinar diseño y adaptar la publicación a canales externos. Ningún canal externo es fuente de experiencias ni debe modificar silenciosamente la memoria del usuario.

## 5. Ciclo de vida de una experiencia

### Fase A: captura

La evidencia puede nacer sin padre. Vibeapp la guarda con fecha/hora, persona, procedencia y clave de idempotencia. Una foto o archivo sin historia aparece en la Bandeja de evidencia de VibePWA.

El contexto ambiente se guarda como señal temporal. Nunca crea experiencia, evento ni nota de Obsidian por sí solo.

### Fase B: adopción y relato

El usuario crea una experiencia con título, narrativa, fecha/rango y evidencia elegida. La fecha es el filtro principal de la bandeja. El backend vincula los activos adoptados; el binario original se conserva en Storage.

Una experiencia es narrada cuando tiene relato humano propio o cuando al menos un evento interno tiene relato humano. Esta es una regla de *rollup*: se cuentan experiencias narradas, no textos individuales.

### Fase C: curación

Curar reorganiza sin destruir:

| Operación | Resultado requerido |
| --- | --- |
| Mover evidencia | Un solo vínculo activo; el archivo no se duplica ni se borra. |
| Soltar evidencia | Regresa a Bandeja; el archivo permanece en Activos. |
| Fusionar | La secundaria queda como antecedente y no cuenta en salidas activas. |
| Dividir | Nacen dos historias editables; la original queda como antecedente. |
| Promover evento | El evento se vuelve experiencia con sus datos y evidencia. |
| Degradar experiencia | La historia menor se vuelve evento de la historia padre; queda antecedente. |

## 6. Clasificación y reglas de decisión

Las categorías no mezclan actividad, estado y lugar:

- **Actividades que pueden ser experiencia:** Trabajo, Paseo/Viaje, Aprendizaje, Social, Entretenimiento, Creatividad, Espiritualidad y algunos episodios de Salud o Compras.
- **Estado/dimensión:** Bienestar, energía, ánimo, recuperación. Califican una experiencia, no la crean.
- **Lugar/contexto:** Hogar, ubicación, clima, biometría, noticias. Describen condiciones, no actividades.

Antes de crear una experiencia, la pregunta es: “¿hay un relato humano de lo vivido y una actividad o episodio que se sostenga?”. Si no, se conserva como evidencia o contexto candidato a revisar.

## 7. Informes y productos de salida

| Salida | Pregunta que responde | Contenido |
| --- | --- | --- |
| Librería | ¿Qué tengo guardado? | Historias, eventos, activos y edición. |
| Mapa | ¿Qué se conecta? | Tiempo, personas, lugares, temas, evidencia y contexto. |
| Reportes | ¿Qué ocurrió en este alcance? | Tendencias, indicadores, evidencia y contexto disponible. |
| Hallazgos | ¿Qué conviene observar o hacer? | Patrones, confianza, recomendación humana y acción. |
| Publicaciones | ¿Qué quiero contar a otros? | PDF editorial cronológico, narrativa y multimedia seleccionada. |
| Obsidian | ¿Qué puedo curar y relacionar a largo plazo? | Notas, enlaces, activos y MOCs. |

Los resultados deben declarar límites de datos. No se inventan categoría, energía, sueño ni conclusiones clínicas cuando la fuente no es suficiente.

## 8. Integraciones y compatibilidad

### Fuentes móviles y wearables

- Apple/iPhone/iPad: texto, cámara, audio, video, ubicación, archivos y HealthKit cuando el permiso/flujo nativo esté disponible.
- Oura Ring: integración OAuth/API y archivos de respaldo normalizados; los datos vacíos son válidos cuando no hubo lecturas.
- Samsung/Health Connect: preparado por contrato, pendiente de validación física con dispositivo real.
- Meta/Oakley/Ray-Ban: fotos y videos se importan por el teléfono; no se asume control total de los lentes ni audio independiente.

### Voz V

V es el comando de Vibe dentro de una aplicación activa. El backend preserva el contrato de acciones para comandos operativos y mantiene conversación libre para preguntas abiertas. Las claves de proveedor quedan únicamente en servidor.

## 9. Seguridad, privacidad y resiliencia

- Sesión autenticada antes de guardar datos destinados a sincronización multidispositivo.
- Permisos del sistema para cámara, micrófono, ubicación y salud, solicitados solo cuando el usuario usa la función.
- Storage privado y URLs firmadas de duración limitada.
- Cola local, reintento e idempotencia para resistir conexión irregular sin duplicar.
- Respaldo antes de limpieza o baja de datos en nube.
- Separación entre controles cotidianos y diagnósticos técnicos: Operación/Administración concentra lo técnico.

## 10. Idiomas y accesibilidad

El producto soporta español, inglés, francés y portugués. Cada flujo de usuario debe contar con textos completos en los cuatro idiomas; no se acepta una traducción parcial que deje etiquetas técnicas o una sección sin localizar.

Los estados deben comunicar acciones sencillas: Guardado, Sincronizando, Requiere acción o No se pudo completar, con una explicación concreta. La interfaz normal no expone nombres de tablas, APIs ni servicios internos.

## 11. Operación y despliegue

### Controles de calidad previos a publicar

1. Sintaxis de cliente y servidor.
2. Pruebas de flujo de Vibeapp, activos, automatización y contrato Obsidian.
3. PDF ReportLab válido para Reportes, Hallazgos, Publicaciones y Manual.
4. Revisión de UI de los flujos modificados en escritorio y móvil/tableta cuando corresponda.
5. Push a `main`; Railway construye y verifica `/api/health`.
6. Prueba real posterior al deploy para cualquier permiso, integración física o cambio de flujo crítico.

### Roles de coordinación

| Responsable | Dueño de cambios |
| --- | --- |
| Codex PC | VibePWA, backend, documentación de producto y servidor. |
| Claude MAC | Vibeapp Flutter e integraciones de dispositivos. |
| Claude PC | Obsidian, mapa de conocimiento y auditoría de bóveda. |
| Miguel | Decisiones de producto, validación humana y coordinación final. |

Un handcheck debe indicar objetivo, versión, datos de prueba, responsable, resultado esperado y criterio de cierre. No se intercambia una carpeta completa si basta un documento o archivos cambiados.

## 12. Validación pendiente de curación

La operación de mover/soltar/fusionar tiene evidencia de uso. Faltan las pruebas reales y registradas de **dividir** y **degradar** con VibePWA, Supabase y Obsidian.

La guía ejecutable es `docs/handcheck-curacion-dividir-degradar-20260723.md`. Ambas operaciones se consideran cerradas solo cuando Librería, Reportes, Hallazgos, Publicaciones, Mapa y Obsidian muestran una única historia activa, preservan el antecedente y no duplican activos.

## 13. Fuente de verdad documental

| Documento | Uso |
| --- | --- |
| Este blueprint | Visión de producción y decisiones de ecosistema. |
| `docs/manual-usuario-vibe-20260723.md` | Manual amigable para uso diario. |
| `docs/capture-adoption-blueprint-20260721.md` | Especificación de implementación de captura/adopción. |
| `docs/vibeapp-vibepwa-operating-contract.md` | Contrato entre plataformas y API. |
| `docs/story-curation-operations-20260723.md` | Reglas detalladas de curación. |
| `obsidian-vault-vibe/90_System/*` | Espejo conceptual y reglas de la bóveda. |

Si estos documentos difieren, este blueprint y el contrato de narrativa se revisan antes de modificar código. El manual de usuario debe simplificar las reglas, nunca cambiarlas.
