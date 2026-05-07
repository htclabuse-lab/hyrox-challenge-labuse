import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const resendKey = process.env.RESEND_API_KEY;
  const supabaseUrl = 'https://mzyfnmjzlosranptwucr.supabase.co';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  const stripe = new Stripe(stripeSecret);
  const sig = req.headers['stripe-signature'];
  const rawBody = await buffer(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send('Webhook error: ' + err.message);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email;
    const nom = session.customer_details?.name;
    const montantPaye = (session.amount_total || 0) / 100;

    console.log('Paiement reçu pour:', email, '- Montant:', montantPaye);

    // 1. Mise à jour Supabase : passer le statut de "en_attente" à "paye"
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      const { data: inscriptions, error: selectError } = await supabase
        .from('Inscriptions')
        .select('id')
        .eq('email', email)
        .eq('statut_paiement', 'en_attente')
        .order('created_at', { ascending: false })
        .limit(1);

      if (selectError) {
        console.error('Erreur Supabase select:', selectError);
      } else if (inscriptions && inscriptions.length > 0) {
        const inscriptionId = inscriptions[0].id;
        const { error: updateError } = await supabase
          .from('Inscriptions')
          .update({ statut_paiement: 'paye' })
          .eq('id', inscriptionId);

        if (updateError) {
          console.error('Erreur Supabase update:', updateError);
        } else {
          console.log('Inscription', inscriptionId, 'marquée comme payée');
        }
      } else {
        console.warn('Aucune inscription en_attente trouvée pour:', email);
      }
    } catch (err) {
      console.error('Erreur lors de la mise à jour Supabase:', err);
    }

    // 2. Envoi du mail de confirmation via Resend
    try {
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + resendKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Hyrox Challenge La Buse <onboarding@resend.dev>',
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
              </p>
              <div style="text-align:center;margin-top:2rem;">
                <a href="https://hyrox-challenge-labuse.vercel.app" style="background:#FFEE00;color:#0a0a0a;padding:12px 30px;border-radius:8px;text-decoration:none;font-weight:800;">Voir le site</a>
              </div>
              <p style="color:#666;font-size:12px;text-align:center;margin-top:2rem;">Hyrox Training Club La Buse — Saint-Paul, La Réunion</p>
            </div>
          `
        })
      });

      if (!resendResponse.ok) {
        const errorText = await resendResponse.text();
        console.error('Erreur Resend:', resendResponse.status, errorText);
      } else {
        console.log('Mail envoyé à:', email);
      }
    } catch (err) {
      console.error('Erreur lors de l\'envoi du mail:', err);
    }
  }

  res.status(200).json({ received: true });
}

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
