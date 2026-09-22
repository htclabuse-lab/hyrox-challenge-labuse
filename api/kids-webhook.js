import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, CATEGORIE_INSCRIPTION, mailConfirmation, envoyerMail } from '../lib/kids.js';

// ============================================================================
// Webhook Stripe du compte Hyrox (cours Training Kids). Endpoint à déclarer
// dans le dashboard Stripe : https://<domaine>/api/kids-webhook
// Événements : checkout.session.completed, customer.subscription.deleted,
//              invoice.payment_failed, invoice.paid
// Variables Vercel : STRIPE_KIDS_SECRET_KEY, STRIPE_KIDS_WEBHOOK_SECRET
// ============================================================================

export const config = { api: { bodyParser: false } };

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const stripeKey = process.env.STRIPE_KIDS_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_KIDS_WEBHOOK_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!stripeKey || !webhookSecret || !serviceKey) return res.status(500).send('Configuration incomplète');

  const stripe = new Stripe(stripeKey);
  let event;
  try {
    event = stripe.webhooks.constructEvent(await buffer(req), req.headers['stripe-signature'], webhookSecret);
  } catch (err) {
    console.error('kids-webhook signature :', err.message);
    return res.status(400).send('Webhook error: ' + err.message);
  }
  const db = createClient(SUPABASE_URL, serviceKey);

  try {
    // ------------------------------------------------ abonnement mis en place
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      if (s.mode !== 'subscription') return res.status(200).json({ received: true, ignored: 'pas un abonnement' });
      const id = parseInt(s.client_reference_id || s.metadata?.inscription_id, 10);
      if (!id) { console.warn('kids-webhook : pas d\'inscription_id', s.id); return res.status(200).json({ received: true }); }

      const { data: r } = await db.from('Inscriptions').select('*').eq('id', id).eq('categorie', CATEGORIE_INSCRIPTION).single();
      if (!r) { console.warn('kids-webhook : fiche introuvable', id); return res.status(200).json({ received: true }); }
      const dejaPaye = r.statut_paiement === 'payé';

      await db.from('Inscriptions').update({
        statut_paiement: 'payé',
        stripe_customer_id: typeof s.customer === 'string' ? s.customer : (s.customer?.id || null),
        stripe_subscription_id: typeof s.subscription === 'string' ? s.subscription : (s.subscription?.id || null),
      }).eq('id', id);

      if (!dejaPaye && resendKey && r.email) {
        try { await envoyerMail(resendKey, r.email, mailConfirmation(r)); }
        catch (e) { console.error('Mail confirmation KO', e.message); }
      }
      return res.status(200).json({ received: true, id, statut: 'payé' });
    }

    // ------------------------------------------------ résiliation
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      await db.from('Inscriptions').update({ statut_paiement: 'resilie' })
        .eq('categorie', CATEGORIE_INSCRIPTION).eq('stripe_subscription_id', sub.id);
      return res.status(200).json({ received: true, subscription: sub.id, statut: 'resilie' });
    }

    // ------------------------------------------------ prélèvement échoué / régularisé
    if (event.type === 'invoice.payment_failed' || event.type === 'invoice.paid') {
      const inv = event.data.object;
      const subId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id;
      if (subId) {
        const statut = event.type === 'invoice.paid' ? 'payé' : 'impaye';
        await db.from('Inscriptions').update({ statut_paiement: statut })
          .eq('categorie', CATEGORIE_INSCRIPTION).eq('stripe_subscription_id', subId)
          .in('statut_paiement', ['payé', 'impaye']);
      }
      return res.status(200).json({ received: true });
    }

    return res.status(200).json({ received: true, ignored: event.type });
  } catch (e) {
    console.error('kids-webhook', e);
    return res.status(500).json({ error: e.message });
  }
}
