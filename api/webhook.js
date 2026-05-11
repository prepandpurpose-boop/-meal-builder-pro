export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  let event;
  try {
    // Parse raw body for Stripe signature verification
    const body = await getRawBody(req);
    
    if (webhookSecret) {
      const stripe = await import('stripe').then(m => m.default(process.env.STRIPE_SECRET_KEY));
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } else {
      event = JSON.parse(body);
    }
  } catch (err) {
    return res.status(400).json({ error: 'Webhook error: ' + err.message });
  }

  const supabaseHeaders = {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,
    'Authorization': 'Bearer ' + supabaseKey,
  };

  try {
    if (event.type === 'customer.subscription.created' || event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const email = session.customer_email || session.customer_details?.email;
      const customerId = session.customer;
      const subscriptionId = session.subscription || session.id;

      if (email) {
        // Check if subscriber already exists
        const checkRes = await fetch(
          `${supabaseUrl}/rest/v1/subscribers?email=eq.${encodeURIComponent(email)}&select=id,trial_used`,
          { headers: supabaseHeaders }
        );
        const existing = await checkRes.json();

        if (existing.length > 0) {
          // Update existing subscriber
          await fetch(`${supabaseUrl}/rest/v1/subscribers?email=eq.${encodeURIComponent(email)}`, {
            method: 'PATCH',
            headers: { ...supabaseHeaders, 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              status: 'active',
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              trial_used: true,
            }),
          });
        } else {
          // Insert new subscriber
          await fetch(`${supabaseUrl}/rest/v1/subscribers`, {
            method: 'POST',
            headers: { ...supabaseHeaders, 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              email,
              status: 'active',
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              trial_used: true,
            }),
          });
        }
      }
    }

    if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      const status = subscription.status;
      const customerId = subscription.customer;

      // Map Stripe status to our status
      const ourStatus = ['active', 'trialing'].includes(status) ? 'active' : 'cancelled';

      await fetch(`${supabaseUrl}/rest/v1/subscribers?stripe_customer_id=eq.${customerId}`, {
        method: 'PATCH',
        headers: { ...supabaseHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status: ourStatus }),
      });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export const config = { api: { bodyParser: false } };
