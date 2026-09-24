# Despliegue en el VPS

Cada push a `front-initial` compila el frontend con Vite en GitHub Actions y
publica `dist/` en el VPS (`.github/workflows/deploy.yml` → `deploy/deploy.sh`).
Un contenedor `nginx:alpine` lo sirve en **http://46.225.232.228:8100** y
redirige `/api` al backend (`deploy/nginx.conf`).

Necesita en Settings → Secrets and variables → Actions: variables `VPS_HOST` y
`VPS_USER`, y el secret `VPS_PASSWORD`. Opcional: variable `VITE_API_URL`
(por defecto `/api`).

La guía completa está en `DEPLOY.md` del repo teacher-mobile-backend.
