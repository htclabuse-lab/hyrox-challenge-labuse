import Stripe from 'stripe';

const stripe = new Stripe('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');
const webhookSecret = 'whsec_okUKAt1LJxXn3eNVgFCJzBkKUnZGvNSe';
const resendKey = 're_VMVgpP43_PL348CNsLaf9Mf7UmL4FfckD';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    return res.status(400).send('Webhook error: ' + err.message);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email;
    const nom = session.customer_details?.name;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + resendKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Hyrox Challenge La Buse <htclabuse@gmail.com>',
        to: email,
        subject: '✅ Inscription confirmée — Hyrox Challenge La Buse',
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0a0a0a;color:#fff;padding:2rem;border-radius:12px;">
            <div style="text-align:center;margin-bottom:1.5rem;">
              <h1 style="color:#FFEE00;">Hyrox Challenge <span style="color:#fff">La Buse</span></h1>
            </div>
            <h2 style="color:#FFEE00;">Inscription confirmée ! 🎉</h2>
            <p style="color:#ccc;line-height:1.7;margin-top:1rem;">
              Bonjour ${nom || ''},<br><br>
              Ton inscription au <strong style="color:#FFEE00;">Hyrox Challenge La Buse #2</strong> est bien confirmée !<br><br>
              📅 <strong>Dimanche 12 juillet 2026</strong><br>
              📍 <strong>Crossfit La Buse — Saint-Paul, La Réunion</strong><br><br>
              On t'attend sur la ligne de départ ! 💪
