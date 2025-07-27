# Utiliser Node.js 20 Alpine pour une image plus légère
FROM node:20-alpine

# Installer FFmpeg et les dépendances nécessaires
RUN apk add --no-cache ffmpeg

# Créer le répertoire de travail
WORKDIR /app

# Copier les fichiers de configuration
COPY package*.json ./
COPY tsconfig.json ./

# Installer toutes les dépendances (incluant devDependencies pour le build)
RUN npm install

# Copier le code source
COPY src/ ./src/

# Compiler TypeScript
RUN npm run build

# Supprimer les devDependencies après le build pour optimiser l'image
RUN npm prune --production

# Créer les répertoires pour les fichiers temporaires
RUN mkdir -p /app/temp /app/uploads /app/output

# Exposer le port
EXPOSE 3000

# Définir les variables d'environnement
ENV NODE_ENV=production
ENV PORT=3000

# Commande de démarrage
CMD ["npm", "start"] 