// Sends transactional email via Resend (resend.com). Works out of the box with the
// 'onboarding@resend.dev' test sender — no domain verification needed to get started;
// swap EMAIL_FROM to a verified domain address once you have one.

export async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email send. Would have sent:', { to, subject });
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Scholar Transit <onboarding@resend.dev>',
        to,
        subject,
        html
      })
    });

    const data = await res.json();
    if (!res.ok) {
      // Never throw from here — a failed email must never crash the request that
      // triggered it (registration, resend, etc). Log it, report it, move on.
      console.error('Resend email error:', JSON.stringify(data));
      return { sent: false, reason: data?.message || 'send_failed' };
    }
    return { sent: true, id: data.id };
  } catch (err) {
    console.error('Resend request failed:', err.message);
    return { sent: false, reason: err.message };
  }
}

export function verificationEmailHtml(code, businessName) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <div style="background: #16233F; color: white; padding: 24px; border-radius: 16px 16px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">Scholar Transit</h1>
      </div>
      <div style="background: #F7F4EC; padding: 32px 24px; border-radius: 0 0 16px 16px;">
        <p>Hi${businessName ? ` ${businessName}` : ''},</p>
        <p>Welcome aboard! Use this code to confirm your email and activate your account:</p>
        <div style="background: white; border: 1px solid #E4E0D4; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #16233F;">${code}</span>
        </div>
        <p style="color: #65708A; font-size: 13px;">This code expires in 15 minutes. If you didn't sign up for Scholar Transit, you can ignore this email.</p>
      </div>
    </div>
  `;
}
