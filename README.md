# Gmail Agent Onboarding

Une application Express minimaliste qui propose une page d'inscription pour vos clients et gère le flux
OAuth 2.0 avec Gmail. Les informations sont stockées dans Supabase et le projet est prêt pour un
déploiement sur Railway.

## Fonctionnalités

- Page d'accueil en français avec formulaire d'inscription.
- Redirection vers Google OAuth afin d'accorder l'accès Gmail à votre agent.
- Récupération du profil Google et sauvegarde des tokens dans Supabase.
- Pages de succès, d'erreur et mentions légales.

## Prérequis

- Node.js 18+
- Un projet Google Cloud avec des identifiants OAuth 2.0 (type application Web).
- Un projet Supabase avec une table `gmail_agent_connections`.
- Un compte Railway pour le déploiement.

## Installation

```bash
npm install
```

Copiez le fichier `.env.example` vers `.env` et remplissez les variables :

```bash
cp .env.example .env
```

| Variable | Description |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Identifiant OAuth 2.0 généré dans Google Cloud. |
| `GOOGLE_CLIENT_SECRET` | Secret OAuth 2.0 correspondant. |
| `GOOGLE_REDIRECT_URI` | URL de callback autorisée (localhost en dev, domaine Railway en prod). |
| `SUPABASE_URL` | URL de votre projet Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service role Supabase (conservez-la secrète). |
| `SESSION_SECRET` | Chaîne aléatoire utilisée pour sécuriser les sessions Express. |

### Table Supabase

Exécutez la migration suivante dans le SQL Editor Supabase :

```sql
create table if not exists public.gmail_agent_connections (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_email text not null,
  google_user_id text not null,
  google_email text not null,
  access_token text,
  refresh_token text,
  expiry_date bigint,
  created_at timestamptz default timezone('utc'::text, now())
);
```

Vous pouvez ensuite ajouter des politiques RLS adaptées à votre cas d'usage ou désactiver RLS pour cette
table si vous utilisez exclusivement la clé service role côté serveur.

## Lancer en développement

```bash
npm run dev
```

L'application est disponible sur [http://localhost:3000](http://localhost:3000).

## Déploiement sur Railway

1. Poussez ce dépôt sur GitHub.
2. Depuis Railway, créez un nouveau projet via l'option « Deploy from GitHub ».
3. Ajoutez les variables d'environnement dans l'onglet « Variables ».
4. Mettez à jour `GOOGLE_REDIRECT_URI` avec `https://<votre-service>.up.railway.app/auth/google/callback` et
   ajoutez cette URL dans la console Google Cloud.
5. Déployez. Railway installera les dépendances et lancera `npm start`. L'application écoute
   automatiquement sur la variable d'environnement `PORT` fournie par Railway et sur `0.0.0.0`,
   ce qui lui permet de répondre correctement aux vérifications d'état de la plateforme.

## Personnalisation

- Modifiez les vues EJS dans `views/` pour ajuster le contenu marketing.
- Personnalisez le style dans `public/styles.css`.
- Ajoutez des logs supplémentaires ou une file d'attente pour traiter les emails dans `src/server.js`.

## Sécurité

- Ne partagez jamais votre `SUPABASE_SERVICE_ROLE_KEY`.
- Sur Google Cloud, limitez les scopes accordés en fonction de vos besoins.
- Pensez à ajouter une page de politique de confidentialité conforme à la réglementation en vigueur.
