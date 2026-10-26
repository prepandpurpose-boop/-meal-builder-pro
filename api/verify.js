// Meal Builder Pro: after sign-in, confirms the signed-in email has an active subscription.
import { userEmail, subscribed } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const email = await userEmail(req);
    if (!email) return res.status(401).json({ access: false, reason: 'sign-in' });
    const ok = await subscribed(email);
    return res.json({ access: ok, email, reason: ok ? '' : 'no-active-subscription' });
  } catch (err) {
    console.error('verify error', err && err.message);
    return res.status(500).json({ access: false, reason: 'error' });
  }
}
