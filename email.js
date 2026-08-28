// Sends transactional email via Gmail SMTP — works with any regular Gmail account,
// no domain or business verification needed. Replaces the Resend version, which
// requires a verified domain to email anyone besides the account owner.
//
// SETUP REQUIRED (one-time, in your Gmail account):
// 1. Go to myaccount.google.com/security, turn on "2-Step Verification"
// 2. Go to myaccount.google.com/apppasswords, create an app password
// 3. In Railway, set two environment variables:
//      GMAIL_USER = digitalserve6@gmail.com   (the Gmail address sending the emails)
//      GMAIL_APP_PASSWORD = the 16-character app password from step 2

import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
  return transporter;
}

export async function sendEmail(to, subject, html) {
  const t = getTransporter();
  if (!t) {
    console.warn('GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping email send. Would have sent:', { to, subject });
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const info = await t.sendMail({
      from: `Traveling Kids <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html
    });
    return { sent: true, id: info.messageId };
  } catch (err) {
    console.error('Gmail send failed:', err.message);
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
