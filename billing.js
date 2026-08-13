import Stripe from 'stripe';
import { db, getBusinessById } from './db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

// Payment link a PARENT uses to pay their child's transportation fees.
export async function createPaymentLink({ parentId, studentId, amountCents, periodLabel }) {
  const payment = db.prepare(
    'INSERT INTO payments (parent_id, student_id, amount_cents, period_label) VALUES (?, ?, ?, ?)'
  ).run(parentId, studentId, amountCents, periodLabel);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'zar',
        unit_amount: amountCents,
        product_data: { name: `School transportation — ${periodLabel}` }
      },
      quantity: 1
    }],
    success_url: `${process.env.APP_URL}/pay/success?payment_id=${payment.lastInsertRowid}`,
    cancel_url: `${process.env.APP_URL}/pay/cancel`,
    metadata: { payment_id: String(payment.lastInsertRowid) }
  });

  db.prepare('UPDATE payments SET stripe_checkout_session_id = ? WHERE id = ?')
    .run(session.id, payment.lastInsertRowid);

  return { payment_url: session.url, payment_id: payment.lastInsertRowid };
}

// Called once a business's 30-day trial ends: creates their recurring subscription checkout,
// priced according to the plan tier they signed up for.
export async function createOwnerSubscriptionCheckout(businessId) {
  const business = getBusinessById(businessId);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: business.stripe_customer_id || undefined,
    line_items: [{
      price_data: {
        currency: 'zar',
        unit_amount: business.price_cents,
        recurring: { interval: 'month' },
        product_data: { name: `Scholar Transit — ${business.plan_tier} plan` }
      },
      quantity: 1
    }],
    success_url: `${process.env.APP_URL}/billing/success`,
    cancel_url: `${process.env.APP_URL}/billing/cancel`,
    metadata: { business_id: String(businessId) }
  });
  return session.url;
}

// Stripe webhook handler — call from stripeWebhook.js with the raw request body.
export function handleStripeEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.metadata?.payment_id) {
        db.prepare("UPDATE payments SET status = 'paid', paid_at = datetime('now') WHERE id = ?")
          .run(session.metadata.payment_id);
      }
      if (session.mode === 'subscription' && session.metadata?.business_id) {
        db.prepare("UPDATE business SET subscription_status = 'active', stripe_subscription_id = ?, stripe_customer_id = ? WHERE id = ?")
          .run(session.subscription, session.customer, session.metadata.business_id);
      }
      break;
    }
    case 'invoice.payment_failed': {
      const customerId = event.data.object.customer;
      const business = db.prepare('SELECT * FROM business WHERE stripe_customer_id = ?').get(customerId);
      if (business) {
        db.prepare("UPDATE business SET subscription_status = 'past_due' WHERE id = ?").run(business.id);
        db.prepare("INSERT INTO alerts (business_id, type, message) VALUES (?, 'payment_failed', 'Subscription payment failed — update billing details.')")
          .run(business.id);
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const customerId = event.data.object.customer;
      const business = db.prepare('SELECT * FROM business WHERE stripe_customer_id = ?').get(customerId);
      if (business) {
        db.prepare("UPDATE business SET subscription_status = 'canceled' WHERE id = ?").run(business.id);
      }
      break;
    }
  }
}
