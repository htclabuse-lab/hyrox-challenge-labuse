import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../lib/kids.js';
import { CATEGORIE, EDITION_2_DEPUIS, CODES_ANNONCE, mailAnnonce, FROM, REPLY_TO } from '../lib/parent-enfant.js';

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
  if (!CODES_ANNONCE[b.code]) return res.status(400).json({ error: 'Code inconnu : KIDS20 ou REVIENS10' });
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!serviceKey || !resendKey) return res.status(500).json({ error: 'Configuration serveur incomplète' });

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
