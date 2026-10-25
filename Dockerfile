FROM node:22-bookworm-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm test && npm run build

FROM python:3.12-slim-bookworm AS application
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.lock requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt
RUN useradd --create-home --uid 10001 student
COPY --chown=student:student . .
COPY --from=frontend --chown=student:student /frontend/dist /app/frontend_dist
RUN mkdir -p /app/data /app/staticfiles && chown student:student /app/data /app/staticfiles \
    && chmod +x /app/docker/entrypoint.sh
USER student
EXPOSE 8000
ENTRYPOINT ["/app/docker/entrypoint.sh"]
