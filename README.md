# HowPass Video Service

Service de fusion vidéo pour HowPass, déployé sur Google Cloud Run.

## 🚀 Fonctionnalités

- **Upload de vidéos** : Support de multiples formats (MP4, AVI, MOV, MKV, WebM, FLV)
- **Fusion de vidéos** : Concaténation de plusieurs vidéos en une seule
- **Traitement asynchrone** : Suivi des jobs de fusion en temps réel
- **Qualité configurable** : Options de qualité (low, medium, high)
- **Résolution personnalisable** : Redimensionnement des vidéos
- **Codecs configurables** : Support de différents codecs audio/vidéo
- **API REST** : Interface HTTP complète
- **Déploiement Cloud** : Optimisé pour Google Cloud Run

## 🛠️ Technologies

- **Node.js 20** : Runtime JavaScript
- **TypeScript** : Langage de programmation
- **Express.js** : Framework web
- **FFmpeg** : Traitement vidéo
- **fluent-ffmpeg** : Wrapper Node.js pour FFmpeg
- **Multer** : Gestion des uploads de fichiers
- **Docker** : Conteneurisation

## 📦 Installation

Se rendre sur google cloud et creer le projet 'howpass-services' puis executer les commandes suivantes sur Cloud Shell

```bash

# Recupérer le PROJECT_ID du projet howpass-services
gcloud projects list

# Configurer le contexte
gcloud config set project PROJECT_ID

# Active les APIs nécessaires
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com

# Vérifier l'existence du repo
gcloud auth login
gcloud artifacts repositories list --location=europe-west1

# Créer le repo si besoin
gcloud artifacts repositories create howpass-services \
  --repository-format=docker \
  --location=europe-west1 \
  --description="Dépôt Docker pour Cloud Run"

```
Autoriser l'accès public du service sur 

gcloud artifacts repositories create howpass-services \
  --repository-format=docker \
  --location=europe-west1

### Prérequis

- Node.js 18+
- FFmpeg installé sur le système
- Docker (pour le déploiement)

### Installation locale

```bash
# Cloner le projet
cd howpass-service

# Installer les dépendances
npm install

# Copier le fichier d'environnement
cp env.example .env

# Configurer les variables d'environnement
# Éditer .env selon vos besoins

# Démarrer en mode développement
npm run dev

# Ou compiler et démarrer en production
npm run build
npm start
```

### Installation de FFmpeg

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install ffmpeg
```

#### macOS
```bash
brew install ffmpeg
```

#### Windows
Télécharger depuis [ffmpeg.org](https://ffmpeg.org/download.html)

## 🔧 Configuration

### Variables d'environnement

```env
# Configuration du serveur
PORT=3000
NODE_ENV=development

# Configuration des fichiers
MAX_FILE_SIZE=100MB
UPLOAD_PATH=./uploads
TEMP_PATH=./temp
OUTPUT_PATH=./output

# Configuration FFmpeg
FFMPEG_TIMEOUT=300000
FFMPEG_THREADS=4

# Configuration CORS
CORS_ORIGIN=http://localhost:3000

# Configuration de sécurité
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100
```

## 📡 API Endpoints

### 1. Santé du service
```http
GET /api/video/health
```

### 2. Upload de vidéos
```http
POST /api/video/upload
Content-Type: multipart/form-data

videos: [fichiers vidéo]
```

### 3. Fusion de vidéos
```http
POST /api/video/merge
Content-Type: application/json

{
  "files": [
    {
      "id": "uuid",
      "filename": "video1.mp4",
      "path": "/path/to/video1.mp4",
      "size": 1024000,
      "mimetype": "video/mp4"
    }
  ],
  "outputFormat": "mp4",
  "quality": "medium",
  "resolution": "1920x1080",
  "fps": 30,
  "audioCodec": "aac",
  "videoCodec": "h264"
}
```

### 4. Statut d'un job
```http
GET /api/video/job/:jobId
```

### 5. Téléchargement d'une vidéo
```http
GET /api/video/download/:filename
```

### 6. Nettoyage d'un job
```http
DELETE /api/video/job/:jobId
```

## 🐳 Déploiement Docker

### Build de l'image
```bash
docker build -t howpass-service .
```

### Exécution locale
```bash
docker run -p 3000:3000 howpass-service
```

## ☁️ Déploiement Google Cloud Run

### 1. Build et push de l'image
```bash
# Configurer gcloud
gcloud auth configure-docker

# Build et push
docker build -t gcr.io/PROJECT_ID/howpass-service .
docker push gcr.io/PROJECT_ID/howpass-service
```

### 2. Déploiement sur Cloud Run
```bash
gcloud run deploy howpass-service \
  --image gcr.io/PROJECT_ID/howpass-service \
  --platform managed \
  --region europe-west1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 900 \
  --concurrency 10
```

### 3. Configuration des variables d'environnement
```bash
gcloud run services update howpass-service \
  --set-env-vars NODE_ENV=production,MAX_FILE_SIZE=100MB
```

Se rendre sur GCP pour récupérer un clé associée à un compte de service et valoriser dans l'environnement des gitactions (GCP_SA_KEY)

## 📊 Utilisation

### Exemple avec cURL

```bash
# Upload de vidéos
curl -X POST http://localhost:3000/api/video/upload \
  -F "videos=@video1.mp4" \
  -F "videos=@video2.mp4"

# Fusion de vidéos
curl -X POST http://localhost:3000/api/video/merge \
  -H "Content-Type: application/json" \
  -d '{
    "files": [
      {
        "id": "uuid1",
        "filename": "video1.mp4",
        "path": "/app/uploads/video1.mp4",
        "size": 1024000,
        "mimetype": "video/mp4"
      }
    ],
    "outputFormat": "mp4",
    "quality": "medium"
  }'

# Vérifier le statut
curl http://localhost:3000/api/video/job/JOB_ID

# Télécharger le résultat
curl -O http://localhost:3000/api/video/download/merged_JOB_ID.mp4
```

## 🔍 Monitoring

### Logs
```bash
# Logs Cloud Run
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=howpass-service"
```

### Métriques
- Temps de traitement par vidéo
- Taille des fichiers traités
- Taux de succès/échec
- Utilisation CPU/mémoire

## 🛡️ Sécurité

- **Helmet.js** : Headers de sécurité HTTP
- **CORS** : Configuration des origines autorisées
- **Validation** : Vérification des types de fichiers
- **Limites** : Taille et nombre de fichiers
- **Timeout** : Protection contre les traitements longs

## 🧪 Tests

```bash
# Tests unitaires
npm test

# Tests avec coverage
npm run test:coverage

# Tests d'intégration
npm run test:integration
```

## 📝 Scripts disponibles

```bash
npm run build      # Compilation TypeScript
npm start          # Démarrage en production
npm run dev        # Démarrage en développement
npm test           # Tests unitaires
npm run lint       # Vérification du code
npm run lint:fix   # Correction automatique
```

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 🆘 Support

Pour toute question ou problème :
- Ouvrir une issue sur GitHub
- Contacter l'équipe HowPass
- Consulter la documentation FFmpeg 