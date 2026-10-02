import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL, CATEGORIE_PREINSCRIPTION, CATEGORIE_INSCRIPTION, PRIX_MENSUEL, PRIX_CARNET, SEANCES_CARNET,
  PLACES_PAR_GROUPE, GROUPES, FORMULE_ABO, FORMULE_CARNET,
  emailValide, ageDe, groupeParAge, placesParGroupe, mailListeAttente, envoyerMail,
} from '../lib/kids.js';

// ============================================================================
// Inscription au cours Training Kids (page kids-inscription.html).
//
//  GET  → places prises / libres par groupe (affichage sur la page).
//  POST → enregistre la fiche (catégorie "Hyrox Kids Inscription") puis :
//         - groupe plein  → statut 'liste_attente', mail liste d'attente, pas de paiement
//         - sinon         → statut 'en_attente' + session Stripe Checkout en
//                           ABONNEMENT mensuel (30 €/mois, prélevé le 1er).
//                           RIEN n'est prélevé le jour de l'inscription : période
//                           d'essai jusqu'au 1er du mois suivant (trial_end), donc
//                           pas de prorata. Le webhook api/kids-webhook.js passe la
//                           fiche en 'payé' quand l'abonnement est en place.
//
// Compte Stripe : celui de la société Hyrox (clés STRIPE_KIDS_*), distinct du
// compte CrossFit utilisé pour les Hyrox Challenge (STRIPE_SECRET_KEY).
// ============================================================================

const STRIPE_KEY_ENV = 'STRIPE_KIDS_SECRET_KEY';

// 1er du mois suivant, à 00h00 UTC (= 04h00 à La Réunion, donc bien le 1er sur place).
// Sert d'ancre de facturation : premier prélèvement ce jour-là, rien avant.
//
// Deux pièges Stripe, rencontrés en vrai :
//  - un `trial_end` doit être à plus de 48 h → inutilisable fin de mois ;
//  - un `billing_cycle_anchor` ne peut pas être POSTÉRIEUR à la date naturelle
//    de facturation (création + 1 mois, à la même heure). D'où le 00h00 UTC :
//    une inscription le 1er à 02h53 UTC donnait une ancre au 1er du mois suivant
//    à 04h00, soit après la date naturelle (02h53) → refus (bug du 01/10/2026).
function premierDuMoisSuivant() {
  const t = new Date();
  return Math.floor(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1, 0, 0, 0) / 1000);
}

function nettoie(s, max = 80) { return String(s || '').trim().slice(0, max); }

export default async function handler(req, res) {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Configuration serveur incomplète (Supabase)' });
  const db = createClient(SUPABASE_URL, serviceKey);

  if (req.method === 'GET') {
    try {
      const places = await placesParGroupe(db);
      return res.status(200).json({ places, groupes: GROUPES, prix: PRIX_MENSUEL, prix_carnet: PRIX_CARNET, max: PLACES_PAR_GROUPE });
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
  const carnet = b.formule === 'carnet';

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

    // Groupe : celui fixé par le coach sur la pré-inscription s'il existe, sinon selon l'âge
    // (groupe 2 à partir de 9 ans). Pas de choix par le parent.
    const { data: pre } = await db.from('Inscriptions')
      .select('groupe')
      .eq('categorie', CATEGORIE_PREINSCRIPTION)
      .ilike('co1_prenom', f.enfant_prenom).ilike('co1_nom', f.enfant_nom)
      .not('groupe', 'is', null).limit(1);
    const groupe = (pre && pre.length && GROUPES[pre[0].groupe]) ? pre[0].groupe : groupeParAge(f.enfant_dob);

    const places = await placesParGroupe(db);
    const plein = places[groupe].libres <= 0;
    // Carnet refusé quand le groupe approche de sa limite d'abonnés (mais si le
    // groupe est complet, c'est la liste d'attente qui s'applique, comme pour tous).
    if (carnet && !plein && !places[groupe].carnet_possible) {
      return res.status(409).json({ error: "Le carnet n'est plus proposé sur ce créneau. Passe par l'abonnement mensuel, ou écris-nous à htclabuse@gmail.com." });
    }

    // Groupe complet (12 enfants, toutes formules confondues) : liste d'attente
    // pour tout le monde, carnets compris, et aucun paiement n'est demandé.
    const enAttente = plein;
    const fiche = {
      nom: f.parent_nom, prenom: f.parent_prenom, email: f.parent_email, telephone: f.parent_tel,
      categorie: CATEGORIE_INSCRIPTION, prix: carnet ? PRIX_CARNET : PRIX_MENSUEL,
      statut_paiement: enAttente ? 'liste_attente' : 'en_attente',
      co1_nom: f.enfant_nom, co1_prenom: f.enfant_prenom, co1_date_naissance: f.enfant_dob,
      nom_equipe: carnet ? FORMULE_CARNET : FORMULE_ABO, groupe,
      sante_declaree: true,
      niveau: 'regles_acceptees:' + new Date().toISOString(),
    };
    const { data: inserted, error: insErr } = await db.from('Inscriptions').insert(fiche).select('id').single();
    if (insErr) return res.status(500).json({ error: 'Enregistrement impossible : ' + insErr.message });
    const id = inserted.id;

    // ---------------------------------------------------------- liste d'attente
    if (enAttente) {
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
    const desc = `${f.enfant_prenom} ${f.enfant_nom} — samedi matin, groupe ${g.label} (${g.horaire})`;
    const commun = {
      locale: 'fr',
      customer_email: f.parent_email,
      client_reference_id: String(id),
      metadata: { inscription_id: String(id), enfant: `${f.enfant_prenom} ${f.enfant_nom}`, groupe, formule: carnet ? FORMULE_CARNET : FORMULE_ABO },
      success_url: `${origin}/kids-inscription.html?succes=1&id=${id}`,
      cancel_url: `${origin}/kids-inscription.html?annule=1`,
    };
    const session = carnet
      ? await stripe.checkout.sessions.create({
          ...commun,
          // Carnet : paiement unique, réglé immédiatement.
          mode: 'payment',
          line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: PRIX_CARNET * 100,
            product_data: { name: `Training Kids — carnet de ${SEANCES_CARNET} séances`, description: desc } } }],
        })
      : await stripe.checkout.sessions.create({
          ...commun,
          mode: 'subscription',
          line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: PRIX_MENSUEL * 100,
            recurring: { interval: 'month' },
            product_data: { name: 'Training Kids — abonnement mensuel', description: desc } } }],
          subscription_data: {
            // Aucun prélèvement à l'inscription : le premier tombe le 1er du mois suivant,
            // sans prorata pour les jours restants du mois en cours.
            billing_cycle_anchor: premierDuMoisSuivant(),
            proration_behavior: 'none',
            metadata: { inscription_id: String(id), enfant: `${f.enfant_prenom} ${f.enfant_nom}`, groupe },
          },
        });
    return res.status(200).json({ url: session.url, id, groupe, formule: carnet ? FORMULE_CARNET : FORMULE_ABO });
  } catch (e) {
    console.error('kids-checkout', e);
    return res.status(500).json({ error: e.message });
  }
}
