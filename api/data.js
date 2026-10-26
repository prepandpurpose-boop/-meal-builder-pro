// Meal Builder Pro: saves and loads a subscriber's kitchen data in the cloud so it follows them to every device.
// The browser sends {action:'load'} or {action:'save', data} with the signed-in user's token. Only a signed-in email
// with an active subscription in Stripe can load or save, and the database functions require a secret only this server knows.
import { userEmail, subscribed } from '../lib/auth.js';

async function rpc(fn, body) {
  const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) { console.log('data db', fn, r.status, (await r.text()).slice(0, 200)); throw new Error('db'); }
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { action, data } = req.body || {};
    const email = await userEmail(req);
    if (!email) return res.status(401).json({ error: 'Please sign in.' });
    if (!process.env.MBP_SYNC_SECRET || !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return res.status(500).json({ error: 'Sync is not set up yet.' });
    if (!(await subscribed(email))) return res.status(403).json({ error: 'No active subscription.' });
    if (action === 'load') {
      const out = await rpc('mbp_load', { p_email: email, p_secret: process.env.MBP_SYNC_SECRET });
      return res.status(200).json({ data: out || null });
    }
    if (action === 'save') {
      if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Nothing to save.' });
      if (JSON.stringify(data).length > 2 * 1024 * 1024) return res.status(413).json({ error: 'Too big.' });
      await rpc('mbp_save', { p_email: email, p_secret: process.env.MBP_SYNC_SECRET, p_data: data });
      return res.status(200).json({ saved: true });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    console.log('data error', err && err.message);
    return res.status(500).json({ error: 'Could not sync right now.' });
  }
}
