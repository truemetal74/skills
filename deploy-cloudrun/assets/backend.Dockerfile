FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# --- PROJECT CONFIG: system deps ---------------------------------------------
# weasyprint (server-side PDF) needs these; REMOVE this block if not using it.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 \
    libffi-dev libcairo2 && \
    rm -rf /var/lib/apt/lists/*
# ------------------------------------------------------------------------------

RUN useradd -m -s /bin/bash httpd && usermod -aG root httpd

# vendor/ holds committed wheels for private shared packages (my-python repo).
# It MUST be copied before pip install — requirements.txt references ./vendor/*.whl.
COPY ./requirements.txt /app/
COPY ./vendor/ /app/vendor/
RUN pip install --no-cache-dir --upgrade -r requirements.txt

COPY . /app/
# Remove local config — all config comes from environment variables.
# Belt and braces only: a file removed here still ships inside the COPY layer
# above. .dockerignore / .gcloudignore are what keep secrets out (SKILL.md rule 8).
RUN rm -f /app/.env /app/.env_pydantic
RUN chmod 755 /app/start-web-server.sh

USER httpd

ARG API_PORT
ENV API_PORT=${API_PORT:-8080}
ENV PYTHONPATH=/app

EXPOSE $API_PORT

CMD ["/app/start-web-server.sh"]
