import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { email } = req.body;
  if (!email) return res.status(400).json({ access: false, reason: 'no-email' });

  try {
    const customers = await stripe.customers.list({ email: email.toLowerCase().trim(), limit: 5 });
    
    if (!customers.data.length) {
      return res.json({ access: false, reason: 'no-account' });
    }

    // Check if any customer has an active subscription
    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'active',
        limit: 5
      });
      if (subscriptions.data.length > 0) {
        return res.json({ access: true });
      }
    }

    // Check for trialing subscriptions too
    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'trialing',
        limit: 5
      });
      if (subscriptions.data.length > 0) {
        return res.json({ access: true });
      }
    }

    return res.json({ access: false, reason: 'no-active-subscription' });
  } catch (err) {
    console.error('Stripe verify error:', err);
    return res.status(500).json({ access: false, reason: 'error' });
  }
}
