// Meal Builder Pro: who is signed in, and do they have an active subscription.
import Stripe from 'stripe';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hoiuounrlakvekxesgzh.supabase.co';
const SUPABASE_PUBLISHABLE = 'sb_publishable_qSrSqf5gs92iBxF1OP-1fg_2UaIttpH';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const okCache = {}; // email -> time the subscription was last confirmed

// Returns the signed-in user's email (lower case) or null.
export async function userEmail(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_PUBLISHABLE, Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.email ? String(u.email).trim().toLowerCase() : null;
}

// Free access: an email listed in the MBP_COMPED_EMAILS setting in Vercel (separated by commas) gets in without a subscription.
const comped = email => String(process.env.MBP_COMPED_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean).includes(email);

// True when the email has free access, or Stripe has an active or trialing subscription for it.
export async function subscribed(email) {
  if (comped(email)) return true;
  if (okCache[email] && Date.now() - okCache[email] < 10 * 60 * 1000) return true;
  const customers = await stripe.customers.list({ email, limit: 5 });
  for (const c of customers.data) {
    for (const st of ['active', 'trialing']) {
      const subs = await stripe.subscriptions.list({ customer: c.id, status: st, limit: 3 });
      if (subs.data.length) { okCache[email] = Date.now(); return true; }
    }
  }
  return false;
}
