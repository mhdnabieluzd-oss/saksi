FROM python:3.11-slim

WORKDIR /app

# Install dependencies sistem asas
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

# Install Python libraries
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy kod backend
COPY . .

# Guna Shell Form (PENTING: Jangan guna kurungan [])
CMD uvicorn saksi.main:app --host 0.0.0.0 --port $PORT