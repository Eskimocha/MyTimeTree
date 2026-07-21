FROM python:3.11-slim

WORKDIR /app

# Keep image lean for 256 MB nano instances
COPY requirements-app.txt .
RUN pip install --no-cache-dir -r requirements-app.txt

COPY main.py .

EXPOSE 8000

# Critical: shell form so PORT expands at runtime (Koyeb / ai-builders.space)
CMD sh -c "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"
