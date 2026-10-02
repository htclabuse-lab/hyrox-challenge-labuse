import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, emailValide } from '../lib/kids.js';
import { CATEGORIE, EDITION_2_DEPUIS, TYPE_STRIPE, PRIX, PRIX_PACK_PHOTO, DATE_LABEL, AGE_MIN, AGE_MAX, FORMATS, ageLeJour } from '../lib/parent-enfant.js';

// ============================================================================
// Inscription Hyrox Parents / Enfants — 2e édition (page parent-enfant-inscription.html).
//
//  POST → enregistre la fiche (catégorie « Parent-Enfant », statut 'en_attente')
//         puis crée une session Stripe Checkout de 68 € sur le compte Training
//         Club (STRIPE_KIDS_SECRET_KEY), avec la case « code promo » ouverte
//         (KIDS20 / REVIENS10 créés par Stéphanie dans Stripe).
//         Le webhook api/kids-webhook.js passe la fiche en 'paye'.
// ============================================================================

const TAILLES_ENFANT = ['5-6 ans', '7-8 ans', '9-11 ans', '12-14 ans',
  'S Homme', 'M Homme', 'L Homme', 'XL Homme', 'XXL Homme',
  'S Femme', 'M Femme', 'L Femme', 'XL Femme'];
const TAILLES_ADULTE = { Homme: ['S', 'M', 'L', 'XL', 'XXL'], Femme: ['S', 'M', 'L', 'XL'] };

// Inscriptions ouvertes le 02/10/2026 (passer à false pour les fermer).
const INSCRIPTIONS_OUVERTES = true;

function nettoie(s, max = 80) { return String(s || '').trim().slice(0, max); }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!INSCRIPTIONS_OUVERTES) return res.status(403).json({ error: 'Les inscriptions ne sont pas encore ouvertes.' });
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const stripeKey = process.env.STRIPE_KIDS_SECRET_KEY;
  if (!serviceKey || !stripeKey) return res.status(500).json({ error: 'Configuration serveur incomplète' });
  const db = createClient(SUPABASE_URL, serviceKey);

  const b = req.body || {};
  const f = {
    parent_prenom: nettoie(b.parent_prenom),
    parent_nom: nettoie(b.parent_nom).toUpperCase(),
    parent_email: nettoie(b.parent_email, 120).toLowerCase(),
    parent_tel: nettoie(b.parent_tel, 20),
    parent_dob: nettoie(b.parent_dob, 10),
    parent_genre: nettoie(b.parent_genre, 10),
    parent_taille: nettoie(b.parent_taille, 5),
    enfant_prenom: nettoie(b.enfant_prenom),
    enfant_nom: nettoie(b.enfant_nom).toUpperCase(),
    enfant_dob: nettoie(b.enfant_dob, 10),
    enfant_tshirt: nettoie(b.enfant_tshirt, 20),
    urg_prenom: nettoie(b.urg_prenom),
    urg_nom: nettoie(b.urg_nom).toUpperCase(),
    urg_tel: nettoie(b.urg_tel, 20),
    format: nettoie(b.format, 10),
  };
  if (Object.values(f).some(v => !v)) return res.status(400).json({ error: 'Tous les champs sont requis.' });
  if (!emailValide(f.parent_email)) return res.status(400).json({ error: 'Email invalide.' });
  if (!FORMATS[f.format]) return res.status(400).json({ error: 'Choisis un format : Standard ou XL.' });
  if (!TAILLES_ADULTE[f.parent_genre] || !TAILLES_ADULTE[f.parent_genre].includes(f.parent_taille)) return res.status(400).json({ error: 'Taille de t-shirt parent invalide.' });
  if (!TAILLES_ENFANT.includes(f.enfant_tshirt)) return res.status(400).json({ error: 'Taille de t-shirt enfant invalide.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.parent_dob)) return res.status(400).json({ error: 'Date de naissance du parent invalide.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.enfant_dob)) return res.status(400).json({ error: "Date de naissance de l'enfant invalide." });
  const age = ageLeJour(f.enfant_dob);
  if (age === null || age < AGE_MIN || age > AGE_MAX) {
    return res.status(400).json({ error: `L'enfant doit avoir entre ${AGE_MIN} et ${AGE_MAX} ans le ${DATE_LABEL}.` });
  }
  if (b.sante !== true) return res.status(400).json({ error: "L'attestation de santé est obligatoire." });
  const pack = b.pack_photo === true;

  try {
    // Même enfant déjà inscrit et payé sur cette édition ? Pas de doublon.
    const { data: existants } = await db.from('Inscriptions')
      .select('id')
      .eq('categorie', CATEGORIE).gte('created_at', EDITION_2_DEPUIS).eq('statut_paiement', 'paye')
      .ilike('co1_prenom', f.enfant_prenom).ilike('co1_nom', f.enfant_nom).eq('co1_date_naissance', f.enfant_dob);
    if (existants && existants.length) {
      return res.status(409).json({ error: `${f.enfant_prenom} est déjà inscrit(e) avec un parent. Une question ? Écris-nous à htclabuse@gmail.com.` });
    }

    const fiche = {
      nom: f.parent_nom, prenom: f.parent_prenom, email: f.parent_email, telephone: f.parent_tel,
      date_naissance: f.parent_dob, genre: f.parent_genre,
      categorie: CATEGORIE, prix: PRIX + (pack ? PRIX_PACK_PHOTO : 0), statut_paiement: 'en_attente', pack_photo: pack,
      niveau: FORMATS[f.format].label,
      tshirt_coupe: f.parent_genre, tshirt_taille: f.parent_taille,
      co1_prenom: f.enfant_prenom, co1_nom: f.enfant_nom, co1_date_naissance: f.enfant_dob, co1_tshirt: f.enfant_tshirt,
      contact_urgence_prenom: f.urg_prenom, contact_urgence_nom: f.urg_nom, contact_urgence_tel: f.urg_tel,
      sante_declaree: true,
    };
    const { data: inserted, error: insErr } = await db.from('Inscriptions').insert(fiche).select('id').single();
    if (insErr) return res.status(500).json({ error: 'Enregistrement impossible : ' + insErr.message });
    const id = inserted.id;

    const stripe = new Stripe(stripeKey);
    const origin = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      locale: 'fr',
      customer_email: f.parent_email,
      client_reference_id: String(id),
      allow_promotion_codes: true,
      metadata: { type: TYPE_STRIPE, inscription_id: String(id), enfant: `${f.enfant_prenom} ${f.enfant_nom}`, format: f.format },
      line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: PRIX * 100,
        product_data: { name: 'Hyrox Parents / Enfants — 2e édition',
          description: `${f.parent_prenom} ${f.parent_nom} + ${f.enfant_prenom} ${f.enfant_nom} — ${FORMATS[f.format].label} — ${DATE_LABEL}` } } },
        ...(pack ? [{ quantity: 1, price_data: { currency: 'eur', unit_amount: PRIX_PACK_PHOTO * 100,
          product_data: { name: 'Pack photo — Hyrox Parents / Enfants', description: 'Photos du binôme' } } }] : [])],
      success_url: `${origin}/parent-enfant-inscription.html?succes=1`,
      cancel_url: `${origin}/parent-enfant-inscription.html?annule=1`,
    });
    return res.status(200).json({ url: session.url, id });
  } catch (e) {
    console.error('pe-checkout', e);
    return res.status(500).json({ error: e.message });
  }
}
