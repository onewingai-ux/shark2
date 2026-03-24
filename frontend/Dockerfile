FROM node:20
WORKDIR /app

# Install dependencies
COPY frontend/package*.json ./
RUN npm install

# Copy source and build
COPY frontend/ .
RUN npm run build

# Install serve to run the built app
RUN npm install -g serve

CMD ["serve", "-l", "5173", "dist"]