export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  const supabaseHeaders = {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,
    'Authorization': 'Bearer ' + supabaseKey,
  };

  try {
    const event = req.body;
    const eventType = event.type;
    const obj = event.data?.object;

    if (eventType === 'checkout.session.completed') {
      const email = obj.customer_email || obj.customer_details?.email;
      const customerId = obj.customer;
      const subscriptionId = obj.subscription;

      if (email) {
        const checkRes = await fetch(
          `${supabaseUrl}/rest/v1/subscribers?email=eq.${encodeURIComponent(email.toLowerCase())}&select=id`,
          { headers: supabaseHeaders }
        );
        const existing = await checkRes.json();

        if (existing.length > 0) {
          await fetch(`${supabaseUrl}/rest/v1/subscribers?email=eq.${encodeURIComponent(email.toLowerCase())}`, {
            method: 'PATCH',
            headers: { ...supabaseHeaders, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ status: 'active', stripe_customer_id: customerId, stripe_subscription_id: subscriptionId, trial_used: true }),
          });
        } else {
          await fetch(`${supabaseUrl}/rest/v1/subscribers`, {
            method: 'POST',
            headers: { ...supabaseHeaders, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ email: email.toLowerCase(), status: 'active', stripe_customer_id: customerId, stripe_subscription_id: subscriptionId, trial_used: true }),
          });
        }
      }
    }

    if (eventType === 'customer.subscription.deleted' || eventType === 'customer.subscription.updated') {
      const status = obj.status;
      const customerId = obj.customer;
      const ourStatus = ['active', 'trialing'].includes(status) ? 'active' : 'cancelled';

      await fetch(`${supabaseUrl}/rest/v1/subscribers?stripe_customer_id=eq.${customerId}`, {
        method: 'PATCH',
        headers: { ...supabaseHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status: ourStatus }),
      });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(200).json({ received: true });
  }
}
