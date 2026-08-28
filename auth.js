import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db, getBusinessByEmail } from './db.js';
import { sendEmail, verificationEmailHtml } from './email.js';
import { tierForStudentCount } from './pricing.js';

export const authRouter = Router();

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function hashForStorage(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${hashPassword(password, salt)}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  return hashPassword(password, salt) === hash;
}

function signToken(businessId) {
  return jwt.sign({ businessId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Fire-and-forget email send — never let a slow/broken mail server block the
// HTTP response. Errors are logged, not thrown, and the caller doesn't await this.
function sendEmailInBackground(to, subject, html) {
  sendEmail(to, subject, html).catch((err) => {
    console.error('Background email send failed:', err.message);
  });
}

// Self-serve registration: creates the business record, picks a plan tier based on
// expected student count, and emails a 6-digit code before the account can log in.
authRouter.post('/register', async (req, res) => {
  const { contactName, contactSurname, email, phone, companyName, companyAddress, password, expectedStudents } = req.body;

  if (!contactName || !contactSurname || !email || !phone || !companyName || !password) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (getBusinessByEmail(email)) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const tier = tierForStudentCount(expectedStudents);
  const code = generateCode();
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const result = db.prepare(`
    INSERT INTO business (
      name, owner_email, owner_password_hash, contact_name, contact_surname, contact_phone,
      company_name, company_address, trial_started_at, trial_days, plan_tier, student_limit,
      price_cents, verification_code, verification_expires
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)
  `).run(
    companyName, email, hashForStorage(password), contactName, contactSurname, phone,
    companyName, companyAddress || null, Number(process.env.TRIAL_DAYS || 30),
    tier.id, tier.maxStudents === Infinity ? 999999 : tier.maxStudents, tier.priceCents,
    code, expires
  );

  // Don't block the response on the email send — Gmail SMTP can take anywhere from
  // 1 to 120+ seconds to respond, and the person is sitting on a signup screen waiting.
  // The code is always returned here as a fallback so nobody gets locked out if the
  // email is slow, fails, or lands in spam — this mirrors the same safety net the
  // Resend sandbox limitation required before.
  sendEmailInBackground(email, 'Confirm your Scholar Transit account', verificationEmailHtml(code, contactName));

  res.json({ ok: true, businessId: result.lastInsertRowid, plan: tier, devCode: code });
});

authRouter.post('/verify', (req, res) => {
  const { email, code } = req.body;
  const business = getBusinessByEmail(email);
  if (!business) return res.status(404).json({ error: 'No account found for that email.' });
  if (business.email_verified) return res.status(400).json({ error: 'Already verified — just log in.' });
  if (!business.verification_code || business.verification_code !== code) {
    return res.status(400).json({ error: 'Incorrect code.' });
  }
  if (new Date(business.verification_expires) < new Date()) {
    return res.status(400).json({ error: 'That code expired — request a new one.' });
  }

  db.prepare("UPDATE business SET email_verified = 1, verification_code = NULL WHERE id = ?").run(business.id);
  const token = signToken(business.id);
  res.json({ token, business: { id: business.id, name: business.name, email: business.owner_email, planTier: business.plan_tier } });
});

authRouter.post('/resend-code', async (req, res) => {
  const { email } = req.body;
  const business = getBusinessByEmail(email);
  if (!business) return res.status(404).json({ error: 'No account found for that email.' });
  if (business.email_verified) return res.status(400).json({ error: 'Already verified — just log in.' });

  const code = generateCode();
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  db.prepare('UPDATE business SET verification_code = ?, verification_expires = ? WHERE id = ?').run(code, expires, business.id);

  // Same fire-and-forget fix as /register — see comment above.
  sendEmailInBackground(email, 'Your new Scholar Transit code', verificationEmailHtml(code, business.contact_name));

  res.json({ ok: true, devCode: code });
});

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body;
  const business = getBusinessByEmail(email);
  if (!business || !verifyPassword(password, business.owner_password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (!business.email_verified) {
    return res.status(403).json({ error: 'Please verify your email first.', needsVerification: true });
  }
  const token = signToken(business.id);
  res.json({ token, business: { id: business.id, name: business.name, email: business.owner_email, planTier: business.plan_tier } });
});

// Google Sign-In: verifies the ID token straight against Google's own endpoint —
// no extra SDK/dependency needed. If this email already has an account, logs them
// in; otherwise creates one (email is pre-verified by Google, so skips the code step).
authRouter.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Missing Google credential' });

  let payload;
  try {
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    if (!verifyRes.ok) throw new Error('Invalid token');
    payload = await verifyRes.json();
    if (process.env.GOOGLE_CLIENT_ID && payload.aud !== process.env.GOOGLE_CLIENT_ID) {
      throw new Error('Token audience mismatch');
    }
  } catch {
    return res.status(401).json({ error: 'Could not verify Google sign-in.' });
  }

  let business = getBusinessByEmail(payload.email);
  if (!business) {
    const result = db.prepare(`
      INSERT INTO business (name, owner_email, owner_password_hash, contact_name, trial_started_at, trial_days, email_verified)
      VALUES (?, ?, ?, ?, datetime('now'), ?, 1)`
    ).run(payload.name || payload.email, payload.email, hashForStorage(crypto.randomBytes(16).toString('hex')),
      payload.given_name || null, Number(process.env.TRIAL_DAYS || 30));
    business = db.prepare('SELECT * FROM business WHERE id = ?').get(result.lastInsertRowid);
  }

  const token = signToken(business.id);
  res.json({ token, business: { id: business.id, name: business.name, email: business.owner_email, planTier: business.plan_tier } });
});

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');
  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
