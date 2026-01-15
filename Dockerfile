FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Torch (CPU) on Debian slim typically needs libgomp.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps (kept in docs/requirements.txt)
COPY docs/requirements.txt /app/docs/requirements.txt
RUN pip install -r /app/docs/requirements.txt

# Copy app source
COPY . /app

# Match existing deployment/run convention: run from docs/
WORKDIR /app/docs

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
