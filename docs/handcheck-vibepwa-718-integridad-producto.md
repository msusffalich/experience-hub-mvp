# Handcheck VibePWA 718 - integridad de producto

Fecha: 2026-07-27
Versión: `20260727-product-integrity-718`

## Objetivo

Cerrar dos fuentes de incoherencia sin modificar la comunicación con Vibeapp:

1. navegación definida dos veces;
2. energía percibida inventada o tratada como cero cuando faltaba.

## Cambios confirmados

- El árbol de navegación del HTML es la única fuente de pertenencia entre
  vistas y espacios principales.
- Se eliminaron el mapa manual duplicado y los enlaces `onclick` aislados.
- La interfaz usa **Nueva historia** en los cuatro idiomas.
- Energía percibida acepta de 1 a 10 y puede quedar vacía.
- Solo un valor explícito del usuario se guarda con `energySource: "user"`.
- Agenda, noticias y comandos rápidos dejan energía en `null`.
- Promedios, tendencias, KPI, mapa, reportes, hallazgos y publicaciones
  excluyen valores ausentes.
- Las salidas muestran **Sin dato** en vez de `0/10`.
- Cuando existe biometría, se identifica como señal biométrica separada.
- El manual integrado y el manual canónico explican la regla.

## Contratos no modificados

- Rutas móviles de autenticación, asistente, IA, Oura, participantes,
  integración, experiencias y multimedia.
- Modelo de sincronización de Vibeapp.
- Exportación a Obsidian.
- Generadores ReportLab y paquetes de publicación.

## Verificación automática

- `node --check app.js`
- `npm run check`
- `npm run verify:product-shell`
- `npm run verify:energy-integrity`
- `npm run verify:release`

Resultado: todas las verificaciones aprobaron. `verify:release` confirmó
contratos, control, blueprint, procesamiento, automatizaciones, seis PDFs,
cuatro endpoints PDF, flujo operativo local y PWA.

La auditoría visual se ejecutó en escritorio y móvil para Nueva historia,
Reportes, Hallazgos y Publicaciones. No detectó desbordamiento horizontal.

## Prueba humana posterior al deploy

1. Abrir **Historias > Nueva historia**.
2. Guardar una historia sin energía.
3. Confirmar que la historia se guarda y que Inicio/Reporte muestran
   **Sin dato**, nunca `0/10` ni energía baja.
4. Editar la misma historia, registrar energía `8` y guardar.
5. Confirmar que Inicio y Reporte incorporan `8/10`.
6. Cambiar entre Inicio, Historias, Evidencia, Inteligencia, Publicar y Cuenta;
   cada vista secundaria debe permanecer dentro de su espacio correcto.

## Resultado esperado

La falta de energía deja de alterar el comportamiento del usuario y los
análisis. La navegación mantiene un solo contrato verificable. No se requiere
ningún cambio de Vibeapp para validar este bloque.

## Estado de salida

Código y documentación listos para commit, push y despliegue.
