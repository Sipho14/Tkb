// Sends transactional email via SendGrid's HTTP API. Switched from Gmail SMTP
// because Railway blocks outbound SMTP connections (ports 587/465) — HTTPS (this)
// is not blocked, so this is the fix for that.
//
// SETUP REQUIRED (one-time, in your SendGrid account):
// 1. Go to sendgrid.com, sign up (free tier is plenty for this)
// 2. Go to Settings → Sender Authentication → Single Sender Verification
//    → add and verify the email you want to send FROM (e.g. your Gmail address)
//    → SendGrid emails you a confirmation link — click it
// 3. Go to Settings → API Keys → Create API Key (Full Access is simplest)
//    → copy the key (starts with "SG.") — you only see it once
// 4. Set two environment variables:
//      SENDGRID_API_KEY = the key from step 3
//      SENDGRID_FROM_EMAIL = the email you verified in step 2

const SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send';

export async function sendEmail(to, subject, html) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL;

  if (!apiKey || !from) {
    console.warn('SENDGRID_API_KEY / SENDGRID_FROM_EMAIL not set — skipping email send. Would have sent:', { to, subject });
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch(SENDGRID_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from, name: 'Traveling Kids' },
        subject,
        content: [{ type: 'text/html', value: html }]
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`SendGrid ${res.status}: ${errText}`);
    }
    return { sent: true };
  } catch (err) {
    console.error('SendGrid send failed:', err.message);
    return { sent: false, reason: err.message };
  }
}

export function verificationEmailHtml(code, businessName) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <div style="background: #16233F; color: white; padding: 24px; border-radius: 16px 16px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">Traveling Kids</h1>
      </div>
      <div style="background: #F7F4EC; padding: 32px 24px; border-radius: 0 0 16px 16px;">
        <p>Hi${businessName ? ` ${businessName}` : ''},</p>
        <p>Welcome aboard! Use this code to confirm your email and activate your account:</p>
        <div style="background: white; border: 1px solid #E4E0D4; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #16233F;">${code}</span>
        </div>
        <p style="color: #65708A; font-size: 13px;">This code expires in 15 minutes. If you didn't sign up for Traveling Kids, you can ignore this email.</p>
      </div>
    </div>
  `;
}

export function resetPasswordEmailHtml(code, businessName) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <div style="background: #16233F; color: white; padding: 24px; border-radius: 16px 16px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">Traveling Kids</h1>
      </div>
      <div style="background: #F7F4EC; padding: 32px 24px; border-radius: 0 0 16px 16px;">
        <p>Hi${businessName ? ` ${businessName}` : ''},</p>
        <p>Use this code to reset your password:</p>
        <div style="background: white; border: 1px solid #E4E0D4; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #16233F;">${code}</span>
        </div>
        <p style="color: #65708A; font-size: 13px;">This code expires in 15 minutes. If you didn't request a password reset, you can ignore this email — your password won't change.</p>
      </div>
    </div>
  `;
}

export function panicAlertEmailHtml({ routeName, driverName, driverPhone, time, mapLink }) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <div style="background: #C1443D; color: white; padding: 24px; border-radius: 16px 16px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">🚨 Panic alert triggered</h1>
      </div>
      <div style="background: #F7F4EC; padding: 32px 24px; border-radius: 0 0 16px 16px;">
        <p style="font-size: 16px;"><strong>Route:</strong> ${routeName}</p>
        <p style="font-size: 16px;"><strong>Driver:</strong> ${driverName || 'Unknown'}${driverPhone ? ` (${driverPhone})` : ''}</p>
        <p style="font-size: 16px;"><strong>Time:</strong> ${time}</p>
        ${mapLink
          ? `<a href="${mapLink}" style="display:inline-block; background:#C1443D; color:white; padding:12px 20px; border-radius:10px; text-decoration:none; font-weight:600; margin-top:12px;">View live location</a>`
          : `<p style="color:#65708A;">Location not available yet — check Live GPS in the dashboard.</p>`
        }
        <p style="color: #65708A; font-size: 13px; margin-top: 24px;">This is an automated emergency alert from your driver's SOS button. Respond immediately.</p>
      </div>
    </div>
  `;
}
