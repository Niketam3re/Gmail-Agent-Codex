import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60
    }
  })
);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);

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

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback'
);

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

  req.session.signupData = { companyName, contactEmail };
  req.session.save(() => {
    res.redirect('/auth/google');
  });
});

app.get('/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).render('error', {
      title: 'Configuration Google manquante',
      message: "L'application n'a pas été configurée avec les identifiants OAuth Google. Merci de contacter le support."
    });
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: gmailScopes,
    prompt: 'consent'
  });

  res.redirect(authUrl);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).render('error', {
      title: 'Autorisation refusée',
      message: 'Google ne nous a pas retourné de code. Merci de réessayer.'
    });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    const signupData = req.session.signupData;
    req.session.signupData = null;

    if (!signupData) {
      return res.render('success', {
        title: 'Accès accordé',
        userEmail: userInfo.data.email,
        companyName: null,
        saved: false
      });
    }

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
