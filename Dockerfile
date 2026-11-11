# One image, one process: the Go binary serves the API at /api and the built
# React app at /, so the browser talks to a single origin (no CORS).

FROM node:24-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.27-alpine AS api
WORKDIR /src
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /calculator .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=api /calculator /calculator
COPY --from=web /web/dist /web
ENV PORT=8080 STATIC_DIR=/web
EXPOSE 8080
ENTRYPOINT ["/calculator"]
