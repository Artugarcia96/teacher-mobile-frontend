# ── Dev stage (hot-reload with Vite) ─────────────────────────────────────────
FROM node:20-slim AS dev

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

EXPOSE 5173

# ── Production build ─────────────────────────────────────────────────────────
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
