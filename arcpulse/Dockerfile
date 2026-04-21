FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
RUN useradd -m appuser && chown -R appuser /app
USER appuser
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "src/index.js"]
