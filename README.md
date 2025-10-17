diff --git a/README.md b/README.md
index 555f3b02ea8feb598a2b2d80b6b2749e8aca67e9..3356e926377eab87ac8a3e4af4e5146d069433c7 100644
--- a/README.md
+++ b/README.md
@@ -15,51 +15,51 @@ déploiement sur Railway.
 
 - Node.js 16+ (l'application ajoute automatiquement `node-fetch` si `fetch` n'est pas disponible)
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
-| `SESSION_SECRET` | Chaîne aléatoire utilisée pour sécuriser les sessions Express. |
+| `SESSION_SECRET` | Chaîne aléatoire utilisée pour signer le paramètre `state` lors du flux OAuth. |
 
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
