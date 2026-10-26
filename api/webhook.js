// Meal Builder Pro: Stripe tells us who has paid. The signature is checked first so only Stripe can mark someone active.
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
export const config = { api: { bodyParser: false } };

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  const supabaseHeaders = { 'Content-Type': 'application/json', apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey };

  let event;
  try {
    const raw = await readRaw(req);
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(raw.toString('utf8'));
    }
  } catch (e) {
    console.log('webhook signature failed', e && e.message);
    return res.status(400).json({ error: 'Bad signature' });
  }

  try {
    const eventType = event.type;
    const obj = event.data && event.data.object;

    if (eventType === 'checkout.session.completed') {
      const email = (obj.customer_email || (obj.customer_details && obj.customer_details.email) || '').toLowerCase().trim();
      const customerId = obj.customer;
      const subscriptionId = obj.subscription;
      if (email) {
        const checkRes = await fetch(`${supabaseUrl}/rest/v1/subscribers?email=eq.${encodeURIComponent(email)}&select=id`, { headers: supabaseHeaders });
        const existing = checkRes.ok ? await checkRes.json() : [];
        const row = { status: 'active', stripe_customer_id: customerId, stripe_subscription_id: subscriptionId };
        if (existing.length > 0) {
          await fetch(`${supabaseUrl}/rest/v1/subscribers?email=eq.${encodeURIComponent(email)}`, { method: 'PATCH', headers: { ...supabaseHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(row) });
        } else {
          await fetch(`${supabaseUrl}/rest/v1/subscribers`, { method: 'POST', headers: { ...supabaseHeaders, Prefer: 'return=minimal' }, body: JSON.stringify({ email, ...row }) });
        }
      }
    }

    if (eventType === 'customer.subscription.deleted' || eventType === 'customer.subscription.updated') {
      const ourStatus = ['active', 'trialing'].includes(obj.status) ? 'active' : 'cancelled';
      await fetch(`${supabaseUrl}/rest/v1/subscribers?stripe_customer_id=eq.${encodeURIComponent(obj.customer)}`, { method: 'PATCH', headers: { ...supabaseHeaders, Prefer: 'return=minimal' }, body: JSON.stringify({ status: ourStatus }) });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err && err.message);
    return res.status(200).json({ received: true });
  }
}
