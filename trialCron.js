import cron from 'node-cron';
import { db, trialStatus } from './db.js';

export function startTrialCron() {
  // Runs once a day at 08:00 server time, across every registered business.
  cron.schedule('0 8 * * *', () => {
    const businesses = db.prepare('SELECT * FROM business').all();

    for (const business of businesses) {
      const status = trialStatus(business);
      if (!status) continue;

      if (status.status === 'trial' && status.daysLeft <= 5 && status.daysLeft > 0) {
        db.prepare("INSERT INTO alerts (business_id, type, message) VALUES (?, 'trial_ending', ?)")
          .run(business.id, `Trial ends in ${status.daysLeft} day(s) — add billing details to avoid interruption.`);
      }
      if (status.expired) {
        db.prepare("UPDATE business SET subscription_status = 'past_due' WHERE id = ? AND subscription_status = 'trial'").run(business.id);
        db.prepare("INSERT INTO alerts (business_id, type, message) VALUES (?, 'trial_ended', 'Free trial has ended. WhatsApp assistant is paused until billing is set up.')")
          .run(business.id);
      }
    }
  });
}
