import { Router } from 'express';
import { db, trialStatus } from './db.js';
import { sendText, extractInboundText } from './whatsapp.js';
import { runAgent } from './agent.js';
import { generateUniqueId } from './uniqueId.js';

export const whatsappWebhook = Router();

// This deployment's WHATSAPP_PHONE_NUMBER_ID/TOKEN are one shared Meta app credential,
// so (for now) one connected WhatsApp number serves one business — whichever one set
// whatsapp_display_number, or the earliest-registered business as a fallback. True
// per-business WhatsApp numbers would mean storing separate Meta credentials per business.
function resolveActiveBusiness() {
  return (
    db.prepare('SELECT * FROM business WHERE whatsapp_display_number IS NOT NULL ORDER BY id LIMIT 1').get() ||
    db.prepare('SELECT * FROM business ORDER BY id LIMIT 1').get()
  );
}

// Meta calls this once when you register the webhook URL in the App Dashboard.
whatsappWebhook.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Builds the last ~10 turns of conversation history into Claude's message format
// so the agent has context (e.g. "which student?" answered in a prior message).
function loadHistory(parentId) {
  const rows = db.prepare(
    'SELECT direction, body FROM messages WHERE parent_id = ? ORDER BY id DESC LIMIT 10'
  ).all(parentId).reverse();
  return rows.map((r) => ({ role: r.direction === 'in' ? 'user' : 'assistant', content: r.body }));
}

whatsappWebhook.post('/', async (req, res) => {
  // Acknowledge immediately — WhatsApp retries aggressively if you don't respond fast.
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    if (!message) return; // status updates (delivered/read) also land here — ignore them

    const from = message.from; // E.164 number, no '+'
    const text = extractInboundText(message);
    if (!text) return;

    const business = resolveActiveBusiness();
    if (!business) return; // no business registered yet — nothing to route this message to

    const trial = trialStatus(business);
    if (trial?.expired && business.subscription_status !== 'active') {
      await sendText(from, 'This service is temporarily paused while the school renews its subscription. Please try again shortly.');
      return;
    }

    let parent = db.prepare('SELECT * FROM parents WHERE whatsapp_number = ? AND business_id = ?').get(from, business.id);
    if (!parent) {
      const info = db.prepare('INSERT INTO parents (business_id, whatsapp_number, unique_id) VALUES (?, ?, ?)')
        .run(business.id, from, generateUniqueId());
      parent = db.prepare('SELECT * FROM parents WHERE id = ?').get(info.lastInsertRowid);
    }

    db.prepare('INSERT INTO messages (parent_id, direction, body) VALUES (?, ?, ?)').run(parent.id, 'in', text);

    const history = loadHistory(parent.id);
    const { text: reply, needsHuman, actionTaken } = await runAgent({ parent, userMessage: text, history });

    db.prepare('INSERT INTO messages (parent_id, direction, body, ai_action, needs_human) VALUES (?, ?, ?, ?, ?)')
      .run(parent.id, 'out', reply, actionTaken, needsHuman ? 1 : 0);

    await sendText(from, reply);
  } catch (err) {
    console.error('Webhook processing error:', err);
  }
});
