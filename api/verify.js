export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/subscribers?email=eq.${encodeURIComponent(email.toLowerCase().trim())}&select=email,status,trial_used`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': 'Bearer ' + supabaseKey,
        }
      }
    );

    const data = await response.json();

    if (data.length === 0) {
      return res.status(200).json({ access: false, reason: 'not_found' });
    }

    const subscriber = data[0];

    if (subscriber.status !== 'active') {
      return res.status(200).json({ access: false, reason: 'cancelled' });
    }

    return res.status(200).json({ access: true, trial_used: subscriber.trial_used });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
