# Déploiement automatique sur Google Cloud Run

Ce document explique comment configurer le déploiement automatique du service de fusion vidéo sur Google Cloud Run via GitHub Actions.

## 🔧 Prérequis

### 1. Compte Google Cloud
- Projet Google Cloud actif
- API Cloud Run activée
- API Container Registry activée
- API Cloud Build activée

### 2. Service Account
Créer un compte de service avec les permissions suivantes :
- `Cloud Run Admin`
- `Storage Admin`
- `Service Account User`
- `Cloud Build Service Account`

```bash
# Créer le service account
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions"

# Attacher les rôles
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Créer la clé JSON
gcloud iam service-accounts keys create key.json \
  --iam-account=github-actions@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

## 🔐 Configuration des secrets GitHub

Dans votre repository GitHub, allez dans **Settings > Secrets and variables > Actions** et ajoutez les secrets suivants :

### Secrets requis

| Nom | Description | Exemple |
|-----|-------------|---------|
| `GCP_PROJECT_ID` | ID de votre projet Google Cloud | `my-project-123456` |
| `GCP_SA_KEY` | Clé JSON du service account (contenu complet du fichier) | `{"type": "service_account", ...}` |
| `SUPABASE_URL` | URL de votre projet Supabase | `https://abc123.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Clé de service Supabase | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `SUPABASE_BUCKET_NAME` | Nom du bucket Supabase Storage | `videos` |
| `CORS_ORIGIN` | Origine autorisée pour CORS | `https://your-app.com` |

### Comment ajouter les secrets

1. **GCP_PROJECT_ID** : L'ID de votre projet Google Cloud
2. **GCP_SA_KEY** : Le contenu complet du fichier `key.json` généré précédemment
3. **SUPABASE_URL** : URL de votre projet Supabase (Settings > API)
4. **SUPABASE_SERVICE_KEY** : Clé de service Supabase (Settings > API > service_role key)
5. **SUPABASE_BUCKET_NAME** : Nom du bucket où stocker les vidéos
6. **CORS_ORIGIN** : URL de votre application frontend

## 🚀 Déploiement

### Déclenchement automatique

Le déploiement se déclenche automatiquement quand :
- Un push est fait sur `main` ou `master`
- Les fichiers modifiés sont dans le dossier `howpass-services/`

### Pipeline de déploiement

1. **Tests** : Linting, tests unitaires, build
2. **Build Docker** : Construction de l'image Docker
3. **Push GCR** : Upload vers Google Container Registry
4. **Deploy Cloud Run** : Déploiement sur Cloud Run

### Configuration Cloud Run

- **Mémoire** : 2Gi
- **CPU** : 2 vCPU
- **Timeout** : 900 secondes (15 minutes)
- **Concurrence** : 10 requêtes simultanées
- **Instances max** : 10
- **Accès public** : Activé

## 📊 Monitoring

### Logs Cloud Run
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=howpass-service"
```

### Métriques
- Temps de réponse
- Utilisation CPU/mémoire
- Nombre de requêtes
- Erreurs

## 🔄 Mise à jour manuelle

Si nécessaire, vous pouvez déployer manuellement :

```bash
# Build et push de l'image
cd howpass-services
docker build -t gcr.io/YOUR_PROJECT_ID/howpass-service .
docker push gcr.io/YOUR_PROJECT_ID/howpass-service

# Déploiement
gcloud run deploy howpass-service \
  --image gcr.io/YOUR_PROJECT_ID/howpass-service \
  --platform managed \
  --region europe-west1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 900 \
  --concurrency 10 \
  --max-instances 10
```

## 🛠️ Dépannage

### Erreurs courantes

1. **Permission denied** : Vérifier les rôles du service account
2. **Image not found** : Vérifier que l'image a été pushée sur GCR
3. **Environment variables** : Vérifier les secrets GitHub
4. **FFmpeg not found** : Vérifier que FFmpeg est installé dans le Dockerfile

### Logs de debug

```bash
# Logs du service
gcloud run services logs read howpass-service --region=europe-west1

# Logs des builds
gcloud builds list --filter="source.repoSource.repoName=howpass-service"
```

## 📝 Variables d'environnement

Le service utilise les variables d'environnement suivantes :

| Variable | Description | Défaut |
|----------|-------------|--------|
| `NODE_ENV` | Environnement | `production` |
| `SUPABASE_URL` | URL Supabase | Requis |
| `SUPABASE_SERVICE_KEY` | Clé service Supabase | Requis |
| `SUPABASE_BUCKET_NAME` | Bucket Supabase | `videos` |
| `FFMPEG_TIMEOUT` | Timeout FFmpeg (ms) | `300000` |
| `FFMPEG_THREADS` | Nombre de threads FFmpeg | `4` |
| `CORS_ORIGIN` | Origine CORS | `*` |
| `TEMP_PATH` | Répertoire temporaire | `./temp` |

## 🔒 Sécurité

- Les secrets sont chiffrés dans GitHub
- Le service account a des permissions minimales
- CORS est configuré pour limiter les origines
- Les fichiers temporaires sont nettoyés automatiquement 