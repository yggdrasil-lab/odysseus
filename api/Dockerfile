FROM python:3.12-slim

ARG TARGETARCH=amd64

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata curl ca-certificates \
    && case "$TARGETARCH" in \
        amd64) PMTILES_ARCH="x86_64" ;; \
        arm64) PMTILES_ARCH="arm64" ;; \
        *) echo "Unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && curl -fsSL "https://github.com/protomaps/go-pmtiles/releases/download/v1.31.2/go-pmtiles_1.31.2_Linux_${PMTILES_ARCH}.tar.gz" -o /tmp/go-pmtiles.tar.gz \
    && mkdir -p /tmp/go-pmtiles \
    && tar -xzf /tmp/go-pmtiles.tar.gz -C /tmp/go-pmtiles \
    && mv /tmp/go-pmtiles/pmtiles /usr/local/bin/pmtiles \
    && chmod 0755 /usr/local/bin/pmtiles \
    && /usr/local/bin/pmtiles version \
    && rm -rf /tmp/go-pmtiles /tmp/go-pmtiles.tar.gz \
    && apt-get purge -y --auto-remove curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 --shell /bin/sh odysseus

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY pyproject.toml alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY tests ./tests
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && chown -R odysseus:odysseus /app

USER odysseus

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
