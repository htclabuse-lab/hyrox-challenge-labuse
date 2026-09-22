import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL, CATEGORIE_PREINSCRIPTION, CATEGORIE_INSCRIPTION, PRIX_MENSUEL, PLACES_PAR_GROUPE, GROUPES,
  emailValide, ageDe, groupeParAge, placesParGroupe, mailListeAttente, envoyerMail,
} from '../lib/kids.js';

// ============================================================================
// Inscription au cours Training Kids (page kids-inscription.html).
//
//  GET  → places prises / libres par groupe (affichage sur la page).
//  POST → enregistre la fiche (catégorie "Hyrox Kids Inscription") puis :
//         - groupe plein  → statut 'liste_attente', mail liste d'attente, pas de paiement
//         - sinon         → statut 'en_attente' + session Stripe Checkout en
//                           ABONNEMENT mensuel (30 €/mois, prélevé le 1er, premier
//                           mois au prorata). Le webhook api/kids-webhook.js passe
//                           la fiche en 'payé' quand l'abonnement est en place.
//
// Compte Stripe : celui de la société Hyrox (clés STRIPE_KIDS_*), distinct du
// compte CrossFit utilisé pour les Hyrox Challenge (STRIPE_SECRET_KEY).
// ============================================================================

const STRIPE_KEY_ENV = 'STRIPE_KIDS_SECRET_KEY';

function premierDuMoisSuivant() {
  const t = new Date();
  // 1er du mois suivant, 04h00 UTC = 08h00 à La Réunion
  return Math.floor(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1, 4, 0, 0) / 1000);
}

function nettoie(s, max = 80) { return String(s || '').trim().slice(0, max); }

export default async function handler(req, res) {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Configuration serveur incomplète (Supabase)' });
  const db = createClient(SUPABASE_URL, serviceKey);

  if (req.method === 'GET') {
    try {
      const places = await placesParGroupe(db);
      return res.status(200).json({ places, groupes: GROUPES, prix: PRIX_MENSUEL, max: PLACES_PAR_GROUPE });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const stripeKey = process.env[STRIPE_KEY_ENV];
  if (!stripeKey) return res.status(500).json({ error: 'Paiement non configuré (' + STRIPE_KEY_ENV + ' manquante)' });
  const resendKey = process.env.RESEND_API_KEY;

  const b = req.body || {};
  const f = {
    enfant_prenom: nettoie(b.enfant_prenom),
    enfant_nom: nettoie(b.enfant_nom).toUpperCase(),
    enfant_dob: nettoie(b.enfant_dob, 10),
    parent_prenom: nettoie(b.parent_prenom),
    parent_nom: nettoie(b.parent_nom).toUpperCase(),
    parent_email: nettoie(b.parent_email, 120).toLowerCase(),
    parent_tel: nettoie(b.parent_tel, 20),
  };
  if (Object.values(f).some(v => !v)) return res.status(400).json({ error: 'Tous les champs sont requis.' });
  if (!emailValide(f.parent_email)) return res.status(400).json({ error: 'Email invalide.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.enfant_dob) || ageDe(f.enfant_dob) === null) return res.status(400).json({ error: 'Date de naissance invalide.' });
  if (b.sante !== true) return res.status(400).json({ error: "L'attestation de santé est obligatoire." });
  if (b.regles !== true) return res.status(400).json({ error: "Il faut accepter les conditions d'inscription." });

  try {
    // Déjà inscrit (payé ou en liste d'attente) ? On ne crée pas de doublon.
    const { data: existants } = await db.from('Inscriptions')
      .select('id,statut_paiement')
      .eq('categorie', CATEGORIE_INSCRIPTION)
      .ilike('co1_prenom', f.enfant_prenom).ilike('co1_nom', f.enfant_nom).eq('co1_date_naissance', f.enfant_dob)
      .in('statut_paiement', ['payé', 'liste_attente']);
    if (existants && existants.length) {
      const s = existants[0].statut_paiement;
      return res.status(409).json({ error: s === 'payé'
        ? `${f.enfant_prenom} est déjà inscrit(e). Une question ? Écris-nous à htclabuse@gmail.com.`
        : `${f.enfant_prenom} est déjà sur liste d'attente. On te recontacte dès qu'une place se libère.` });
    }

    // Groupe : celui fixé par le coach sur la pré-inscription s'il existe, sinon selon l'âge.
    let groupe = groupeParAge(f.enfant_dob);
    const { data: pre } = await db.from('Inscriptions')
      .select('groupe')
      .eq('categorie', CATEGORIE_PREINSCRIPTION)
      .ilike('co1_prenom', f.enfant_prenom).ilike('co1_nom', f.enfant_nom)
      .not('groupe', 'is', null).limit(1);
    if (pre && pre.length && GROUPES[pre[0].groupe]) groupe = pre[0].groupe;

    const places = await placesParGroupe(db);
    const plein = places[groupe].libres <= 0;

    const fiche = {
      nom: f.parent_nom, prenom: f.parent_prenom, email: f.parent_email, telephone: f.parent_tel,
      categorie: CATEGORIE_INSCRIPTION, prix: PRIX_MENSUEL,
      statut_paiement: plein ? 'liste_attente' : 'en_attente',
      co1_nom: f.enfant_nom, co1_prenom: f.enfant_prenom, co1_date_naissance: f.enfant_dob,
      nom_equipe: 'Samedi', groupe,
      sante_declaree: true,
      niveau: 'regles_acceptees:' + new Date().toISOString(),
    };
    const { data: inserted, error: insErr } = await db.from('Inscriptions').insert(fiche).select('id').single();
    if (insErr) return res.status(500).json({ error: 'Enregistrement impossible : ' + insErr.message });
    const id = inserted.id;

    // ---------------------------------------------------------- liste d'attente
    if (plein) {
      const { count } = await db.from('Inscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('categorie', CATEGORIE_INSCRIPTION).eq('statut_paiement', 'liste_attente').eq('groupe', groupe)
        .lte('id', id);
      const position = count || null;
      if (resendKey) {
        try { await envoyerMail(resendKey, f.parent_email, mailListeAttente({ ...fiche, id }, position)); }
        catch (e) { console.error('Mail liste attente KO', e.message); }
      }
      return res.status(200).json({ liste_attente: true, id, groupe, position });
    }

    // ---------------------------------------------------------- Stripe Checkout
    const stripe = new Stripe(stripeKey);
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const origin = 'https://' + host;
    const g = GROUPES[groupe];
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      locale: 'fr',
      customer_email: f.parent_email,
      client_reference_id: String(id),
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'eur',
          unit_amount: PRIX_MENSUEL * 100,
          recurring: { interval: 'month' },
          product_data: {
            name: 'Training Kids — abonnement mensuel',
            description: `${f.enfant_prenom} ${f.enfant_nom} — samedi matin, groupe ${g.label} (${g.horaire})`,
          },
        },
      }],
      subscription_data: {
        billing_cycle_anchor: premierDuMoisSuivant(),
        proration_behavior: 'create_prorations',
        metadata: { inscription_id: String(id), enfant: `${f.enfant_prenom} ${f.enfant_nom}`, groupe },
      },
      metadata: { inscription_id: String(id), enfant: `${f.enfant_prenom} ${f.enfant_nom}`, groupe },
      success_url: `${origin}/kids-inscription.html?succes=1&id=${id}`,
      cancel_url: `${origin}/kids-inscription.html?annule=1`,
    });
    return res.status(200).json({ url: session.url, id, groupe });
  } catch (e) {
    console.error('kids-checkout', e);
    return res.status(500).json({ error: e.message });
  }
}
