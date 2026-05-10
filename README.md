# DSP Personnel Management

Application web de gestion du personnel DSP conforme au cahier des charges fourni.

## Lancement

```powershell
node server.js
```

Puis ouvrir `http://localhost:3000`.

Compte de demonstration :

- E-mail : `admin@dsp.local`
- Mot de passe : `Admin@123`

## Modules inclus

- Authentification par e-mail et mot de passe avec sessions securisees
- Gestion des agents avec matricule policier obligatoire et unique
- Fiches agents cliquables, historique d'affectation et archivage logique
- Fiche d'appel quotidienne avec validation et mise a jour des positions
- Tableau de bord temps reel avec indicateurs, graphiques et alertes
- Rotations hebdomadaires par equipe, unite, jour et horaire
- Gestion documentaire par agent avec type, version et date d'expiration
- Organigramme dynamique base sur les unites, fonctions et grades
- Alertes automatiques : absence injustifiee, sous-effectif, document a renouveler, rotation non planifiee
- Rapports, export compatible Excel et impression PDF navigateur
- Administration utilisateurs, profils et journal de securite
- Journal d'audit des changements sensibles

## Donnees

La version livree fonctionne sans dependances externes et persiste les donnees dans `data/db.json`.
Le schema PostgreSQL de production est fourni dans `database/schema.sql`.

Pour une mise en production, remplacer le module de persistance JSON de `server.js` par un acces PostgreSQL, en gardant les memes routes API.

## Deploiement

Le projet est pret pour un depot GitHub et un hebergement Node.js.

Voir [DEPLOYMENT.md](DEPLOYMENT.md).
