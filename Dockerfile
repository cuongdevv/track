FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Tạo entrypoint script
RUN echo '#!/bin/bash\n\
export PORT="${PORT:-8080}"\n\
exec uvicorn server:app --host 0.0.0.0 --port $PORT\n\
' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Set the entrypoint
ENTRYPOINT ["/app/entrypoint.sh"] 