import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../lib/kids.js';
import { CATEGORIE, EDITION_2_DEPUIS, CODES_ANNONCE, mailAnnonce, mailRelance, mailRelancePE1, FROM, REPLY_TO } from '../lib/parent-enfant.js';

// ============================================================================
// Mail d'annonce Hyrox Parents / Enfants #2 avec code de réduction.
//
//  POST { password, code: 'KIDS20' | 'REVIENS10', dry_run: true }  → liste + nombre, RIEN n'est envoyé
//  POST { password, code, test_to: 'x@y.fr' }                      → 1 seul mail, à cette adresse
//  POST { password, code, envoyer: true }                          → envoi réel (Resend, par lots de 100)
//
// Destinataires (décision de Stéphanie, 02/10/2026), calculés ici à partir de la base :
//  - KIDS20    : 3 familles Training Kids dont un parent est inscrit au HC #3 (NAYLS, BLANCHARD, MARTIAL)
//  - REVIENS10 : parents PE #1 + capitaines HC #2 + inscrits HC #3 + familles Training Kids payées
//                (sans les familles KIDS20, sans les parents déjà inscrits au PE #2)
// ============================================================================

const FAMILLES_KIDS20 = ['NAYLS', 'BLANCHARD', 'MARTIAL'];
const EXCLUS = ['stephanie.caro31@gmail.com', 'turoin.raphael@hotmail.fr']; // Stéphanie + faute de frappe (doublon Turpin)
const HORS_COURSE = ['Hyrox Kids Inscription', 'Hyrox Kids Pré-inscription', 'Bénévole', CATEGORIE];

async function destinataires(db) {
  const { data, error } = await db.from('Inscriptions')
    .select('email,nom,categorie,statut_paiement,created_at,heure_depart').limit(5000);
  if (error) throw new Error(error.message);
  const em = r => String(r.email || '').trim().toLowerCase();
  const set = rows => new Set(rows.map(em).filter(Boolean));
  const kidsPayes = data.filter(r => r.categorie === 'Hyrox Kids Inscription' && r.statut_paiement === 'payé');
  const kids20 = set(kidsPayes.filter(r => FAMILLES_KIDS20.includes(String(r.nom || '').trim().toUpperCase())));
  const dejaPE2 = set(data.filter(r => r.categorie === CATEGORIE && (r.created_at || '') >= EDITION_2_DEPUIS && r.statut_paiement === 'paye'));
  const pe1 = set(data.filter(r => r.categorie === CATEGORIE && (r.created_at || '') < EDITION_2_DEPUIS && r.statut_paiement === 'paye'));
  const course = data.filter(r => !HORS_COURSE.includes(r.categorie) && r.statut_paiement === 'paye');
  const hc2 = set(course.filter(r => (r.heure_depart || '') >= '2026-07-12' && (r.heure_depart || '') < '2026-07-13'));
  const hc3 = set(course.filter(r => !r.heure_depart || (r.heure_depart >= '2026-11-14' && r.heure_depart < '2026-11-16')));
  const exclus = new Set([...EXCLUS, ...dejaPE2]);
  const k20 = [...kids20].filter(e => !exclus.has(e));
  const r10 = [...new Set([...pe1, ...hc2, ...hc3, ...set(kidsPayes)])].filter(e => !exclus.has(e) && !kids20.has(e));
  return { KIDS20: k20.sort(), REVIENS10: r10.sort() };
}

async function resendBatch(resendKey, emails, cle) {
  const resp = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json', 'Idempotency-Key': cle },
    body: JSON.stringify(emails),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error('Resend ' + resp.status + ' : ' + (json.message || JSON.stringify(json)));
  return (json.data || []).length;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  const b = req.body || {};
  if (!process.env.JUGES_PASSWORD || b.password !== process.env.JUGES_PASSWORD) return res.status(401).json({ error: 'Mot de passe incorrect' });
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!serviceKey || !resendKey) return res.status(500).json({ error: 'Configuration serveur incomplète' });

  // Relance des paiements non finalisés : { relance_ids: [..], envoyer: true }. Sans envoyer → essai à blanc.
  // On ne relance que des fiches Parent-Enfant #2 encore en attente (jamais une fiche payée).
  if (Array.isArray(b.relance_ids)) {
    const db = createClient(SUPABASE_URL, serviceKey);
    const { data, error } = await db.from('Inscriptions').select('*')
      .in('id', b.relance_ids.map(Number)).eq('categorie', CATEGORIE).gte('created_at', EDITION_2_DEPUIS).neq('statut_paiement', 'paye');
    if (error) return res.status(500).json({ error: error.message });
    const fiches = (data || []).filter(r => r.email);
    if (b.envoyer !== true) return res.status(200).json({ dry_run: true, nombre: fiches.length, destinataires: fiches.map(r => ({ id: r.id, email: r.email, parent: r.prenom, enfant: r.co1_prenom })) });
    try {
      const n = await resendBatch(resendKey, fiches.map(r => ({ from: FROM, to: r.email, reply_to: REPLY_TO, ...mailRelance(r) })),
        'pe-relance-' + fiches.map(r => r.id).sort().join('-'));
      return res.status(200).json({ envoye: true, envoyes: n, ids: fiches.map(r => r.id) });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // Relance des familles du PE #1 pas encore inscrites (payées) au #2 : { relance_pe1: true, envoyer: true }.
  // Une famille = un email. Exclue si son email, le parent ou l'enfant a déjà une fiche payée au #2.
  if (b.relance_pe1 === true) {
    const db = createClient(SUPABASE_URL, serviceKey);
    const { data, error } = await db.from('Inscriptions').select('prenom,nom,email,co1_prenom,co1_nom,statut_paiement,created_at')
      .eq('categorie', CATEGORIE).eq('statut_paiement', 'paye');
    if (error) return res.status(500).json({ error: error.message });
    const n = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
    const em = r => String(r.email || '').trim().toLowerCase();
    const pe2 = data.filter(r => (r.created_at || '') >= EDITION_2_DEPUIS);
    const pe1 = data.filter(r => (r.created_at || '') < EDITION_2_DEPUIS);
    const em2 = new Set(pe2.map(em)), enf2 = new Set(pe2.map(r => n(r.co1_prenom) + '|' + n(r.co1_nom))), par2 = new Set(pe2.map(r => n(r.prenom) + '|' + n(r.nom)));
    const familles = {};
    pe1.forEach(r => { if (em(r)) (familles[em(r)] = familles[em(r)] || []).push(r); });
    const liste = Object.keys(familles).filter(e => !em2.has(e) && !EXCLUS.includes(e)
      && !familles[e].some(r => enf2.has(n(r.co1_prenom) + '|' + n(r.co1_nom)) || par2.has(n(r.prenom) + '|' + n(r.nom)))).sort();
    const places = Math.max(0, 84 - pe2.length);
    if (b.envoyer !== true) return res.status(200).json({ dry_run: true, nombre: liste.length, places, destinataires: liste });
    try {
      const mail = mailRelancePE1(places);
      let envoyes = 0;
      for (let i = 0; i < liste.length; i += 100) {
        envoyes += await resendBatch(resendKey, liste.slice(i, i + 100).map(to => ({ from: FROM, to, reply_to: REPLY_TO, ...mail })), `pe-relance-pe1-lot${i / 100}-v1`);
      }
      return res.status(200).json({ envoye: true, nombre: liste.length, envoyes, places });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (!CODES_ANNONCE[b.code]) return res.status(400).json({ error: 'Code inconnu : KIDS20 ou REVIENS10' });

  try {
    const liste = (await destinataires(createClient(SUPABASE_URL, serviceKey)))[b.code];
    const mail = mailAnnonce(b.code);
    const unMail = to => ({ from: FROM, to, subject: mail.subject, html: mail.html, reply_to: REPLY_TO });

    if (b.test_to) {
      const n = await resendBatch(resendKey, [unMail(String(b.test_to).trim())], `pe-annonce-test-${b.code}-${Date.now()}`);
      return res.status(200).json({ test: true, envoyes: n, a: b.test_to, nb_destinataires_reels: liste.length });
    }
    if (b.envoyer !== true) return res.status(200).json({ dry_run: true, code: b.code, nombre: liste.length, destinataires: liste });

    let envoyes = 0;
    for (let i = 0; i < liste.length; i += 100) {
      // Idempotency-Key : si l'appel est relancé par erreur, Resend n'envoie pas deux fois le même lot.
      envoyes += await resendBatch(resendKey, liste.slice(i, i + 100).map(unMail), `pe-annonce-${b.code}-lot${i / 100}-v1`);
    }
    return res.status(200).json({ envoye: true, code: b.code, nombre: liste.length, envoyes });
  } catch (e) {
    console.error('pe-annonce', e);
    return res.status(500).json({ error: e.message });
  }
}
