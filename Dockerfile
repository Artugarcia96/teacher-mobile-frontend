FROM node:22-slim AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Empty = same origin (nginx proxies /api). Set it only if the API lives on another domain.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
ENV SEPIA_API_UPSTREAM=http://api:8000
COPY --from=build /app/dist /usr/share/nginx/html
COPY landing /usr/share/nginx/html/landing
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
