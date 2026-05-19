# Guia de publicacion y persistencia multidispositivo

Version de referencia: `20260519-multidevice-persistence-307`

## Objetivo

Publicar Experience Hub para que se use desde desktop, movil y tablet con los mismos datos persistidos en Supabase. El desktop local queda como entorno de desarrollo, no como operacion final.

## Orden recomendado

1. Crear repositorio GitHub privado.
2. Subir el proyecto sin archivos `.env`, logs ni respaldos privados.
3. Confirmar Supabase en modo produccion:
   - `database/schema.sql`
   - `database/auth-rls.sql`
   - `database/semantic-search.sql` si se usara busqueda vectorial.
4. Configurar variables de entorno productivas usando `.env.production.example`.
5. Desplegar el servidor Node en Railway usando `railway.json`.
6. Abrir la URL publicada desde desktop, movil y tablet.
7. Iniciar sesion con Supabase Auth en cada dispositivo.
8. Ejecutar en Administracion:
   - Verificar Supabase
   - Probar flujo real
   - Revisar Persistencia multidispositivo
9. Crear una experiencia real desde cada dispositivo.
10. Validar que Libreria, Activos, Reportes y Publicaciones ven los mismos datos.

## Hosting recomendado para el MVP

Para terminar rapido, usar Railway como primer destino. Encaja con el servidor `server.js`, las rutas API, rutinas y el healthcheck `/api/health`.

Archivos ya preparados:

- `railway.json`: define Railpack, `npm start`, healthcheck `/api/health` y reinicio por fallo.
- `.env.production.example`: variables productivas.
- `.gitignore`: evita publicar `.env`, `data/`, logs y claves locales.
- `package.json`: fija Node `>=20`.

Vercel puede servir frontend y funciones, pero este MVP usa `server.js` con proceso Node, rutinas locales y endpoints API. Para Vercel convendria una refactorizacion posterior a funciones serverless.

## Variables Railway

Configura estas variables en el servicio Railway:

```env
NODE_ENV=production
HOST=0.0.0.0
STORAGE_ADAPTER=supabase
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=experience-media
CONTEXT_TIMEOUT_MS=12000
EMBEDDINGS_PROVIDER=local-hash
EMBEDDING_DIMENSIONS=384
TRANSCRIPTION_PROVIDER=none
```

Railway asigna `PORT` automaticamente. No lo fuerces salvo que tengas una razon operacional.

## Variables minimas

```env
NODE_ENV=production
HOST=0.0.0.0
STORAGE_ADAPTER=supabase
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=experience-media
```

## Criterios de aceptacion

- La app abre desde una URL publica o privada compartible.
- La misma cuenta Supabase Auth puede entrar en desktop, movil y tablet.
- Una experiencia creada en un dispositivo aparece en los otros.
- Un archivo adjunto se guarda en Storage privado o queda marcado como pendiente.
- Reportes y Activos usan datos remotos, no solo `localStorage`.
- Respaldo y restauracion siguen disponibles antes de ampliar usuarios.

## Riesgos a controlar

- No publicar `SUPABASE_SERVICE_ROLE_KEY` en el frontend.
- No subir `.env`, respaldos, logs ni archivos privados al repositorio.
- No usar Storage publico para archivos sensibles.
- Confirmar RLS antes de invitar usuarios externos.
- Hacer una prueba privada con tres usuarios antes de abrir mas acceso.
