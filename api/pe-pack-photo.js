import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, emailValide } from '../lib/kids.js';
import { CATEGORIE, EDITION_2_DEPUIS, TYPE_STRIPE_PACK, PRIX_PACK_PHOTO } from '../lib/parent-enfant.js';

// ============================================================================
// Pack photo Parent-Enfant ajouté APRÈS l'inscription (page pe-pack-photo.html).
//
//  POST { email }                  → binômes payés de la 2e édition pour cet email
//  POST { email, inscription_id }  → session Stripe Checkout 20 € (compte Training
//                                    Club, sans code promo). Le webhook
//                                    api/kids-webhook.js passe pack_photo à true.
// ============================================================================

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const stripeKey = process.env.STRIPE_KIDS_SECRET_KEY;
  if (!serviceKey || !stripeKey) return res.status(500).json({ error: 'Configuration serveur incomplète' });
  const db = createClient(SUPABASE_URL, serviceKey);

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!emailValide(email)) return res.status(400).json({ error: 'Email invalide.' });

  try {
    const { data, error } = await db.from('Inscriptions')
      .select('id,prenom,co1_prenom,statut_paiement,pack_photo')
      .eq('categorie', CATEGORIE).gte('created_at', EDITION_2_DEPUIS).eq('email', email);
    if (error) return res.status(500).json({ error: error.message });
    const binomes = (data || []).filter(r => r.statut_paiement === 'paye');

    const id = parseInt(req.body?.inscription_id, 10);
    if (!id) {
      return res.status(200).json({
        binomes: binomes.map(r => ({ id: r.id, parent: r.prenom, enfant: r.co1_prenom, pack_photo: r.pack_photo === true })),
        en_attente: (data || []).some(r => r.statut_paiement !== 'paye'),
      });
    }

    const r = binomes.find(x => x.id === id);
    if (!r) return res.status(404).json({ error: 'Inscription introuvable pour cet email.' });
    if (r.pack_photo === true) return res.status(409).json({ error: 'Le pack photo est déjà pris pour ce binôme.' });

    const stripe = new Stripe(stripeKey);
    const origin = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      locale: 'fr',
      customer_email: email,
      client_reference_id: 'pack-' + id,
      metadata: { type: TYPE_STRIPE_PACK, inscription_id: String(id) },
      line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: PRIX_PACK_PHOTO * 100,
        product_data: { name: 'Pack photo — Hyrox Parents / Enfants', description: `Binôme ${r.prenom || ''} + ${r.co1_prenom || ''}` } } }],
      success_url: `${origin}/pe-pack-photo.html?succes=1`,
      cancel_url: `${origin}/pe-pack-photo.html`,
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('pe-pack-photo', e);
    return res.status(500).json({ error: e.message });
  }
}
