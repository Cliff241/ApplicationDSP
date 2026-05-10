# Deploiement

## 1. Envoyer le projet sur GitHub

Installer Git si la commande `git --version` ne fonctionne pas :

https://git-scm.com/download/win

Dans le dossier du projet :

```powershell
git init
git add .
git commit -m "Initial DSP personnel management app"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/VOTRE-REPO.git
git push -u origin main
```

## 2. Deployer sur Render

1. Aller sur https://render.com
2. Creer un nouveau `Web Service`
3. Connecter le depot GitHub
4. Render detectera `render.yaml`
5. Commande de demarrage : `node server.js`

## 3. Deployer sur Railway

1. Aller sur https://railway.app
2. Creer un projet depuis GitHub
3. Selectionner le depot
4. Railway lance automatiquement `node server.js` via le script `start`

## 4. Deployer sur un VPS ou serveur local

```powershell
node server.js
```

Pour garder l'application active en production, utiliser un gestionnaire de processus comme PM2 :

```powershell
npm install -g pm2
pm2 start server.js --name dsp-personnel
pm2 save
```

## Notes importantes

- Le serveur utilise `process.env.PORT`, donc il est compatible avec Render, Railway et la plupart des hebergeurs Node.
- Le fichier `data/db.json` est ignore par Git pour eviter de publier les donnees operationnelles.
- Pour une vraie production multi-utilisateur, connecter PostgreSQL avec le schema fourni dans `database/schema.sql`.
