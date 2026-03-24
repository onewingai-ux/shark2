FROM python:3.12-slim
WORKDIR /app

# Install backend dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY backend/ .

# Copy pre-built frontend files
COPY frontend/dist /app/dist

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]