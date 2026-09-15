/**
 * POST /api/leads
 *
 * Receives the diagnostic + contact payload from /diagnostico, validates and
 * normalizes it, scores it server-side (the frontend never sends a score,
 * and if it did this would ignore it), and writes it directly to Google
 * Sheets via the Sheets API using a service account — no Google Apps Script
 * involved. Only on a confirmed write does it return a safe response the
 * frontend uses to decide whether to reveal the scheduling link.
 *
 * This reuses the exact same spreadsheet and service account already
 * configured for the sister landing page (landing_cursia /
 * cursia-landing), just a separate sheet tab — see SHEET_NAME below — so
 * leads from both sites are easy to tell apart without needing a second
 * Google Cloud service account.
 *
 * Required environment (see .dev.vars.example):
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL        - service account's client_email
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  - service account's PEM private key
 *   ALLOWED_ORIGIN                      - this site's own origin, for CORS
 * Optional:
 *   TURNSTILE_SECRET_KEY                - enables real Turnstile verification when set
 *   ENVIRONMENT                         - "development" short-circuits Turnstile verification
 *
 * Setup: this project's Cloudflare Pages settings need the same
 * GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY values
 * already set on the cursia-landing Pages project (Settings → Environment
 * variables, or `wrangler pages secret put <NAME>`). The spreadsheet is
 * already shared with that service account as Editor — nothing to redo in
 * Google Cloud.
 */

// ---------------------------------------------------------------------------
// Fixed spreadsheet + sheet layout — same spreadsheet as cursia-landing,
// separate tab so the two sites' leads never mix columns.
// ---------------------------------------------------------------------------
const SPREADSHEET_ID = '120JGHxoveQSi1ETkFhRDrMIj4CNViacU6F9x5iKKZAg';
const SHEET_NAME = 'Leads — somoscursia';

// Column order — keep in sync with the row built in `buildRow()` below.
const HEADERS = [
  'ID', 'Fecha', 'Nombre completo', 'Institución', 'Cargo', 'Rol', 'País',
  'Correo', 'WhatsApp', 'Sitio web', 'Tipo de organización', 'Modalidad actual',
  'Objetivos', 'Cantidad de programas', 'Estudiantes proyectados',
  'Campus virtual actual', 'Tiempo para iniciar', 'Estado de inversión',
  'Descripción del proyecto', 'Puntaje', 'Calificación', 'Correo corporativo',
  'Autorización de datos', 'Fuente', 'UTM Source', 'UTM Medium',
  'UTM Campaign', 'UTM Content', 'UTM Term', 'Página de origen', 'User Agent',
  'Estado de agenda', 'Fecha de agenda'
];

// ---------------------------------------------------------------------------
// Scoring — the single source of truth. MINIMUM_SCORE_TO_BOOK is the one
// constant to touch if the qualification bar needs to move.
// ---------------------------------------------------------------------------
const MINIMUM_SCORE_TO_BOOK = 8;

const ROLE_SCORES = {
  'Propietario, fundador o representante legal': 3,
  'Rector, director o gerente': 3,
  'Director académico': 3,
  'Director de educación virtual, tecnología o innovación': 3,
  'Coordinador académico': 2,
  'Responsable comercial o de marketing': 2,
  'Docente o instructor': 1,
  'Consultor externo': 1,
  'Otro': 0
};

// Objectives: category score is the HIGHEST tier touched by any selected
// option, capped at 3 — not a sum. Anything unrecognized falls through to 0.
const OBJECTIVES_3PT = new Set([
  'Implementar una modalidad de autoaprendizaje',
  'Digitalizar programas presenciales',
  'Aprovechar mejor nuestro campus virtual Moodle',
  'Reducir la dependencia de sedes físicas'
]);
const OBJECTIVES_2PT = new Set([
  'Llegar a estudiantes de otras ciudades o regiones',
  'Atender más estudiantes',
  'Crear una nueva línea de formación',
  'Reducir la complejidad operativa de producir cursos'
]);

const PROGRAM_COUNT_SCORES = {
  'Más de 20': 3,
  '11 a 20': 3,
  '4 a 10': 2,
  '1 a 3': 1,
  'Aún no lo hemos definido': 0
};

const STUDENT_COUNT_SCORES = {
  'Más de 1.000': 3,
  'Entre 501 y 1.000': 3,
  'Entre 100 y 500': 2,
  'Menos de 100': 1,
  'Aún no lo hemos definido': 0
};

const START_TIMING_SCORES = {
  'Lo antes posible': 3,
  'En los próximos 30 días': 3,
  'En los próximos 3 meses': 3,
  'En los próximos 6 meses': 2,
  'Estamos evaluando para más adelante': 0
};

const INVESTMENT_SCORES = {
  'Sí, contamos con un presupuesto definido': 3,
  'Estamos evaluando presupuestos y proveedores': 2,
  'Necesitamos presentar una propuesta internamente': 2,
  'Todavía no hemos contemplado un presupuesto': 0,
  'Inicialmente buscamos información': 0
};

const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'live.com', 'protonmail.com'
]);

const MAX_BODY_BYTES = 20 * 1024; // 20 KB — this payload is text-only, never near this
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_LIKE_RE = /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}([/?#]\S*)?$/i;
const REQUIRED_CONTACT_FIELDS = ['name', 'institution', 'role', 'country', 'email', 'whatsapp'];
const REQUIRED_ANSWER_FIELDS = [
  'orgType', 'role', 'modality', 'objectives', 'programCount',
  'studentCount', 'virtualCampus', 'startTiming', 'investment'
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function corsHeaders(env) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (env.ALLOWED_ORIGIN) headers['Access-Control-Allow-Origin'] = env.ALLOWED_ORIGIN;
  return headers;
}

function jsonResponse(body, status, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(env))
  });
}

function failResponse(env, status, message) {
  return jsonResponse({ success: false, message }, status, env);
}

const GENERIC_SAVE_ERROR = 'No pudimos guardar la información en este momento. Por favor, inténtalo nuevamente.';

function stripHtml(value) {
  return String(value).replace(/<[^>]*>/g, '');
}

function sanitizeText(value, maxLen) {
  if (typeof value !== 'string') return '';
  const cleaned = stripHtml(value).replace(/\s+/g, ' ').trim();
  return maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string');
  if (typeof value === 'string' && value) return [value];
  return [];
}

function generateLeadId() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += chars[bytes[i] % chars.length];
  return `CUR-${y}${m}${d}-${suffix}`;
}

async function verifyTurnstile(token, env, ip) {
  // Prepared but inactive until real keys exist: development mode and an
  // unset secret both short-circuit to "pass" rather than block every submit.
  if (env.ENVIRONMENT === 'development') return true;
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  try {
    const form = new FormData();
    form.append('secret', env.TURNSTILE_SECRET_KEY);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const data = await res.json();
    return !!(data && data.success === true);
  } catch (err) {
    console.error('Turnstile verification request failed:', err && err.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Google Sheets access via a service account (JWT Bearer flow) — no Apps
// Script, no anonymous access, works in the Workers runtime with Web Crypto.
// ---------------------------------------------------------------------------

function base64url(bytes) {
  let binary = '';
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlFromString(str) {
  return base64url(new TextEncoder().encode(str));
}

function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

let cachedToken = null; // { token, expiresAt } — reused across requests within the same isolate

async function getGoogleAccessToken(env) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30000) {
    return cachedToken.token;
  }

  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not configured.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const unsigned = `${base64urlFromString(JSON.stringify(header))}.${base64urlFromString(JSON.stringify(claimSet))}`;

  const pemKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n');
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(pemKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${base64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.access_token) {
    console.error('Google token exchange failed:', res.status, data);
    throw new Error('No se pudo autenticar con Google.');
  }

  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return data.access_token;
}

async function sheetsFetch(path, accessToken, options) {
  return fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}${path}`, {
    ...(options || {}),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...((options && options.headers) || {})
    }
  });
}

async function ensureSheetAndHeaders(accessToken) {
  const metaRes = await sheetsFetch('?fields=sheets.properties.title', accessToken);
  const meta = await metaRes.json().catch(() => null);
  const exists = !!(meta && (meta.sheets || []).some((s) => s.properties && s.properties.title === SHEET_NAME));
  if (!exists) {
    await sheetsFetch(':batchUpdate', accessToken, {
      method: 'POST',
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] })
    });
  }
  // Idempotent: only writes the header row if row 1 is currently empty.
  const headerRange = encodeURIComponent(`${SHEET_NAME}!A1:A1`);
  const headerRes = await sheetsFetch(`/values/${headerRange}`, accessToken);
  const headerData = await headerRes.json().catch(() => null);
  const hasHeaders = !!(headerData && headerData.values && headerData.values.length > 0);
  if (!hasHeaders) {
    await sheetsFetch(`/values/${encodeURIComponent(SHEET_NAME + '!A1')}?valueInputOption=RAW`, accessToken, {
      method: 'PUT',
      body: JSON.stringify({ values: [HEADERS] })
    });
  }
}

async function appendLeadRow(accessToken, row) {
  const range = encodeURIComponent(`${SHEET_NAME}!A1`);
  return sheetsFetch(
    `/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    accessToken,
    { method: 'POST', body: JSON.stringify({ values: [row] }) }
  );
}

// Soft, best-effort duplicate check — never blocks a submission. A person
// retaking the diagnostic later (even minutes later, on purpose) always gets
// a new row; this only logs so it's visible in the Function's logs.
async function logIfRecentDuplicate(accessToken, email) {
  try {
    const range = encodeURIComponent(`${SHEET_NAME}!B2:H`);
    const res = await sheetsFetch(`/values/${range}`, accessToken);
    const data = await res.json().catch(() => null);
    const rows = (data && data.values) || [];
    const recent = rows.slice(-50);
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const match = recent.find((r) => {
      const rowEmail = String(r[6] || '').toLowerCase(); // column H = Correo (index 6 within B..H)
      const rowDate = Date.parse(r[0] || ''); // column B = Fecha
      return rowEmail === email.toLowerCase() && !isNaN(rowDate) && rowDate > fiveMinAgo;
    });
    if (match) console.log('Recent duplicate submission for', email, '— inserting anyway.');
  } catch (err) {
    // Never let the duplicate check itself block a submission.
    console.error('Duplicate check failed (non-blocking):', err && err.message);
  }
}

function buildRow(leadId, dateReadable, contact, answers, score, qualification, isCorporateEmail, utm, pageUrl, userAgent) {
  return [
    leadId,
    dateReadable,
    contact.name,
    contact.institution,
    contact.role,
    answers.role,
    contact.country,
    contact.email,
    contact.whatsapp,
    contact.website,
    answers.orgType,
    answers.modality,
    answers.objectives.join(' | '),
    answers.programCount,
    answers.studentCount,
    answers.virtualCampus,
    answers.startTiming,
    answers.investment,
    answers.openGoal,
    score,
    qualification,
    isCorporateEmail ? 'Sí' : 'No',
    'Sí',
    utm.utm_source || 'Directo',
    utm.utm_source,
    utm.utm_medium,
    utm.utm_campaign,
    utm.utm_content,
    utm.utm_term,
    pageUrl,
    userAgent,
    'Pendiente',
    ''
  ];
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreLead(answers, email, website) {
  let score = 0;

  score += ROLE_SCORES[answers.role] || 0;

  const objectives = toArray(answers.objectives);
  if (objectives.some((o) => OBJECTIVES_3PT.has(o))) score += 3;
  else if (objectives.some((o) => OBJECTIVES_2PT.has(o))) score += 2;

  score += PROGRAM_COUNT_SCORES[answers.programCount] || 0;
  score += STUDENT_COUNT_SCORES[answers.studentCount] || 0;
  score += START_TIMING_SCORES[answers.startTiming] || 0;
  score += INVESTMENT_SCORES[answers.investment] || 0;

  const emailDomain = (email.split('@')[1] || '').toLowerCase();
  const isCorporateEmail = emailDomain !== '' && !PERSONAL_EMAIL_DOMAINS.has(emailDomain);
  if (isCorporateEmail) score += 2;

  const hasValidWebsite = !!website && URL_LIKE_RE.test(website);
  if (hasValidWebsite) score += 1;

  let qualification = 'Inicial';
  if (score >= 12) qualification = 'Alta';
  else if (score >= MINIMUM_SCORE_TO_BOOK) qualification = 'Media';

  return {
    score,
    qualification,
    qualified: score >= MINIMUM_SCORE_TO_BOOK,
    isCorporateEmail
  };
}

// ---------------------------------------------------------------------------
// Validation + normalization
// ---------------------------------------------------------------------------

function validateAndNormalize(payload) {
  const errors = [];
  const answersIn = (payload && typeof payload.answers === 'object' && payload.answers) || {};
  const contactIn = (payload && typeof payload.contact === 'object' && payload.contact) || {};

  const answers = {
    orgType: sanitizeText(answersIn.orgType, 120),
    role: sanitizeText(answersIn.role, 120),
    modality: sanitizeText(answersIn.modality, 120),
    objectives: toArray(answersIn.objectives).map((o) => sanitizeText(o, 120)).filter(Boolean),
    programCount: sanitizeText(answersIn.programCount, 60),
    studentCount: sanitizeText(answersIn.studentCount, 60),
    virtualCampus: sanitizeText(answersIn.virtualCampus, 120),
    startTiming: sanitizeText(answersIn.startTiming, 60),
    investment: sanitizeText(answersIn.investment, 120),
    openGoal: sanitizeText(answersIn.openGoal, 500)
  };

  REQUIRED_ANSWER_FIELDS.forEach((field) => {
    const val = answers[field];
    const empty = Array.isArray(val) ? val.length === 0 : !val;
    if (empty) errors.push(`answers.${field}`);
  });

  const contact = {
    name: sanitizeText(contactIn.name, 120),
    institution: sanitizeText(contactIn.institution, 160),
    role: sanitizeText(contactIn.role, 120),
    country: sanitizeText(contactIn.country, 80),
    email: sanitizeText(contactIn.email, 160).toLowerCase(),
    whatsapp: sanitizeText(contactIn.whatsapp, 40),
    website: sanitizeText(contactIn.website, 200),
    dataAuthorized: contactIn.dataAuthorized === true
  };

  REQUIRED_CONTACT_FIELDS.forEach((field) => {
    if (!contact[field]) errors.push(`contact.${field}`);
  });

  if (contact.email && !EMAIL_RE.test(contact.email)) errors.push('contact.email');

  const whatsDigits = contact.whatsapp.replace(/\D/g, '');
  if (contact.whatsapp && (whatsDigits.length < 7 || whatsDigits.length > 15)) errors.push('contact.whatsapp');

  if (contact.website && !URL_LIKE_RE.test(contact.website)) errors.push('contact.website');

  if (!contact.dataAuthorized) errors.push('contact.dataAuthorized');

  const utmIn = (payload && typeof payload.utm === 'object' && payload.utm) || {};
  const utm = {
    utm_source: sanitizeText(utmIn.utm_source, 100),
    utm_medium: sanitizeText(utmIn.utm_medium, 100),
    utm_campaign: sanitizeText(utmIn.utm_campaign, 100),
    utm_content: sanitizeText(utmIn.utm_content, 100),
    utm_term: sanitizeText(utmIn.utm_term, 100),
    referrer: sanitizeText(utmIn.referrer, 300)
  };

  const pageUrl = sanitizeText(payload && payload.pageUrl, 300);
  const idempotencyKey = sanitizeText(payload && payload.idempotencyKey, 100);
  const turnstileToken = sanitizeText(payload && payload.turnstileToken, 2000);

  return { errors, answers, contact, utm, pageUrl, idempotencyKey, turnstileToken };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

// A single onRequest catch-all (rather than separate onRequestGet/onRequestPost
// exports) so every method is explicitly decided here — Cloudflare Pages'
// default behavior for an unhandled method on a Function route is to fall
// through to static-asset resolution (which then serves index.html as a SPA
// fallback), not a clean 405. That fallback is harmless in itself, but it
// means "aceptar únicamente POST" wasn't actually being enforced.
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(env) });
  }
  if (request.method !== 'POST') {
    return failResponse(env, 405, 'Método no permitido.');
  }

  return handleLeadsPost(context);
}

async function handleLeadsPost(context) {
  const { request, env } = context;

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return failResponse(env, 415, 'Tipo de contenido no soportado.');
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength && contentLength > MAX_BODY_BYTES) {
    return failResponse(env, 413, 'La solicitud es demasiado grande.');
  }

  let rawBody;
  try {
    rawBody = await request.text();
  } catch (err) {
    console.error('Failed to read request body:', err && err.message);
    return failResponse(env, 400, 'No se pudo leer la solicitud.');
  }
  if (rawBody.length > MAX_BODY_BYTES) {
    return failResponse(env, 413, 'La solicitud es demasiado grande.');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    return failResponse(env, 400, 'El cuerpo de la solicitud no es JSON válido.');
  }

  const { errors, answers, contact, utm, pageUrl } = validateAndNormalize(payload);
  if (errors.length > 0) {
    return jsonResponse({ success: false, message: 'Revisa la información enviada.', errors }, 400, env);
  }

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const turnstileToken = sanitizeText(payload && payload.turnstileToken, 2000);
  const turnstileOk = await verifyTurnstile(turnstileToken, env, ip);
  if (!turnstileOk) {
    return failResponse(env, 403, 'No pudimos verificar la solicitud. Por favor, inténtalo nuevamente.');
  }

  const { score, qualification, qualified, isCorporateEmail } = scoreLead(answers, contact.email, contact.website);

  const leadId = generateLeadId();
  const now = new Date();
  const dateReadable = now.toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  const userAgent = request.headers.get('User-Agent') || '';

  let sheetsOk = false;
  try {
    const accessToken = await getGoogleAccessToken(env);
    const row = buildRow(leadId, dateReadable, contact, answers, score, qualification, isCorporateEmail, utm, pageUrl, userAgent);

    let appendRes = await appendLeadRow(accessToken, row);
    if (!appendRes.ok) {
      // Most likely cause: the sheet tab or its header row doesn't exist yet
      // (first-ever submission). Create it once, then retry.
      await ensureSheetAndHeaders(accessToken);
      appendRes = await appendLeadRow(accessToken, row);
    }
    sheetsOk = appendRes.ok;
    if (!sheetsOk) {
      const errBody = await appendRes.text().catch(() => '');
      console.error('Sheets append failed. Status:', appendRes.status, 'Body:', errBody);
    } else {
      await logIfRecentDuplicate(accessToken, contact.email);
    }
  } catch (err) {
    console.error('Sheets write failed:', err && err.message);
    sheetsOk = false;
  }

  if (!sheetsOk) {
    return failResponse(env, 502, GENERIC_SAVE_ERROR);
  }

  const responseBody = { success: true, leadId, qualified, qualification };
  if (env.ENVIRONMENT === 'development') responseBody.score = score;

  return jsonResponse(responseBody, 200, env);
}
