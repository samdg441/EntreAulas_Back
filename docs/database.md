# Base de datos (Supabase)

Este proyecto usa Supabase (Postgres administrado) para autenticación y almacenamiento de datos.

## Variables de entorno

Configura estas variables:

- `SUPABASE_URL`: URL del proyecto en Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: Service Role key (backend)
- Frontend usa `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`

No subas `.env` al repositorio.

## Instalación backend

1. Instala dependencias en `back/`:
   - `npm install`
2. Crea `.env` en `back/` con:
   - `SUPABASE_URL=...`
   - `SUPABASE_SERVICE_ROLE_KEY=...`
3. El cliente admin se exporta desde `src/config/supabaseClient.ts`.

## Instalación frontend

1. En `front/` crea `.env` con:
   - `VITE_SUPABASE_URL=...`
   - `VITE_SUPABASE_ANON_KEY=...`
2. Reinicia el servidor de desarrollo.

## Notas de seguridad

- Usa la Service Role solo en el backend.
- En el front, solo la anon key.
- Configura RLS en Supabase para proteger tablas.


