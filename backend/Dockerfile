# Gunakan Python 3.11 slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies (kalau ada library C yang diperlukan)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements dan install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy semua kod backend
COPY . .

# Expose port (Railway akan override dengan $PORT)
EXPOSE 8000

# Start command
CMD uvicorn saksi.main:app --host 0.0.0.0 --port $PORT