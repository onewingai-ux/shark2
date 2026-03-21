# Stage 1: Build the Vite frontend
FROM node:20 AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Build the FastAPI backend and serve frontend static files
FROM python:3.12-slim
WORKDIR /app

# Install backend dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY backend/ .

# Copy the built frontend static files from Stage 1
COPY --from=frontend-builder /app/frontend/dist /app/dist

# Use the PORT environment variable provided by Render/Railway (defaults to 8000 if not set)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
