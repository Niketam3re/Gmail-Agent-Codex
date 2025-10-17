import crypto from 'crypto';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

if (!globalThis.fetch) {
  const { default: fetch } = await import('node-fetch');
  globalThis.fetch = fetch;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';
const stateSecret = process.env.SESSION_SECRET || 'change-this-secret';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.urlencoded({ extended: true }));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlEncodeBuffer(buffer) {
  return buffer
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(value) {
  const padding = (4 - (value.length % 4 || 4)) % 4;
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padding);
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function base64UrlDecodeToBuffer(value) {
  const padding = (4 - (value.length % 4 || 4)) % 4;
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padding);
  return Buffer.from(normalized, 'base64');
}

function signStatePayload(encodedPayload) {
  return crypto.createHmac('sha256', stateSecret).update(encodedPayload).digest();
}

function createStateToken(data) {
  const payload = {
    ...data,
    t: Date.now()
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncodeBuffer(signStatePayload(encodedPayload));

  return `${encodedPayload}.${signature}`;
}

function verifyStateToken(token, maxAgeMs = 10 * 60 * 1000) {
  if (!token) {
    return null;
  }

  const parts = token.split('.');

  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, providedSignature] = parts;
  const expectedSignature = signStatePayload(encodedPayload);

  let signatureBuffer;

  try {
    signatureBuffer = base64UrlDecodeToBuffer(providedSignature);
  } catch (error) {
    return null;
  }

  if (
    expectedSignature.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedSignature, signatureBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));

    if (!payload.t || Date.now() - payload.t > maxAgeMs) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
}

async function saveConnectionToSupabase(payload) {
  if (!supabaseConfigured) {
    return { saved: false };
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/gmail_agent_connections`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Erreur Supabase REST:', response.status, text);
      return { saved: false, error: text };
    }

    return { saved: true };
  } catch (error) {
    console.error('Exception lors de la sauvegarde Supabase:', error);
    return { saved: false, error: error.message };
  }
}

function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

  if (!clientId || !clientSecret) {
    return null;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

const gmailScopes = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'openid'
];

app.get('/', (req, res) => {
  res.render('index', {
    hasSupabase: supabaseConfigured,
    googleClientConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  });
});

app.post('/register', (req, res) => {
  const { companyName, contactEmail } = req.body;

  if (!companyName || !contactEmail) {
    return res.status(400).render('error', {
      title: 'Informations manquantes',
      message: 'Merci de renseigner le nom de votre entreprise et votre email de contact pour continuer.'
    });
  }

  const state = createStateToken({ companyName, contactEmail });

  res.redirect(`/auth/google?state=${encodeURIComponent(state)}`);
});

app.get('/auth/google', (req, res) => {
  const oauth2Client = createOAuthClient();

  if (!oauth2Client) {
    return res.status(500).render('error', {
      title: 'Configuration Google manquante',
      message: "L'application n'a pas été configurée avec les identifiants OAuth Google. Merci de contacter le support."
    });
  }

  const { state } = req.query;

  if (!state) {
    return res.status(400).render('error', {
      title: 'Requête invalide',
      message: 'Le paramètre de suivi nécessaire pour Google est manquant. Merci de soumettre à nouveau le formulaire.'
    });
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: gmailScopes,
    prompt: 'consent',
    state
  });

  res.redirect(authUrl);
});

app.get('/auth/google/callback', async (req, res) => {
  const oauth2Client = createOAuthClient();

  if (!oauth2Client) {
    return res.status(500).render('error', {
      title: 'Configuration Google manquante',
      message: "L'application n'a pas été configurée avec les identifiants OAuth Google. Merci de contacter le support."
    });
  }

  const { code, state } = req.query;

  if (!code) {
    return res.status(400).render('error', {
      title: 'Autorisation refusée',
      message: 'Google ne nous a pas retourné de code. Merci de réessayer.'
    });
  }

  const signupData = verifyStateToken(state);

  if (!signupData) {
    return res.status(400).render('error', {
      title: 'Lien expiré ou invalide',
      message: "Le lien de connexion n'est plus valide. Merci de recommencer le processus d'inscription."
    });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    let saved = false;

    if (supabaseConfigured) {
      const { saved: supabaseSaved } = await saveConnectionToSupabase({
        company_name: signupData.companyName,
        contact_email: signupData.contactEmail,
        google_user_id: userInfo.data.id,
        google_email: userInfo.data.email,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date
      });

      saved = supabaseSaved;
    }

    res.render('success', {
      title: 'Accès accordé',
      userEmail: userInfo.data.email,
      companyName: signupData.companyName,
      saved
    });
  } catch (error) {
    console.error('Erreur lors du callback Google:', error);
    res.status(500).render('error', {
      title: 'Erreur pendant la connexion',
      message: "Nous n'avons pas pu finaliser l'autorisation Google. Merci de réessayer ou de contacter le support.",
      error: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
});

app.get('/mentions-legales', (req, res) => {
  res.render('legal');
});

app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page introuvable',
    message: "La page que vous recherchez n'existe pas."
  });
});

app.listen(port, host, () => {
  console.log(`Serveur démarré sur http://${host}:${port}`);
});

