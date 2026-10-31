import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../lib/kids.js';
import { CATEGORIE, EDITION_2_DEPUIS, FROM, REPLY_TO } from '../lib/parent-enfant.js';

// ============================================================================
// Écritures des pages juges Hyrox Parents / Enfants (juge-pe.html, juge-pe-pack.html).
// La clé publique ne peut plus faire d'UPDATE : tout passe par ici, avec la clé serveur.
//
//  POST { password, action: 'maj', ids: [..], champs: { heure_debut_reelle | temps_final_s | pack_remis_at } }
//       → heure_debut_reelle : ISO datetime du top départ de la vague
//       → temps_final_s      : temps total en secondes à l'arrivée
//       → pack_remis_at      : ISO datetime de remise du pack photo
//  POST { password, action: 'mail', id, subject, html }
//       → mail « bravo » envoyé à l'email de la fiche (jamais à une autre adresse)
//
// Limité aux fiches Parent-Enfant de la 2e édition.
// La colonne dossard est RÉSERVÉE au numéro physique (1-95), pas au temps.
// ============================================================================

const JUGE_PWD = process.env.JUGE_PE_PASSWORD || 'labuse'; // même mot de passe que l'écran de connexion des pages juges
const CHAMPS = ['heure_debut_reelle', 'temps_final_s', 'pack_remis_at'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  const b = req.body || {};
  if (b.password !== JUGE_PWD) return res.status(401).json({ error: 'Mot de passe incorrect' });
  if (!process.env.SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Configuration serveur incomplète' });
  const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const pe2 = q => q.eq('categorie', CATEGORIE).gte('created_at', EDITION_2_DEPUIS);

  if (b.action === 'maj') {
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0);
    const champs = b.champs || {};
    const cles = Object.keys(champs);
    if (!ids.length || !cles.length || cles.some(k => !CHAMPS.includes(k))) return res.status(400).json({ error: 'Requête invalide' });
    const { data, error } = await pe2(db.from('Inscriptions').update(champs).in('id', ids)).select('id');
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, maj: (data || []).length });
  }

  if (b.action === 'mail') {
    if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'Configuration serveur incomplète' });
    const { data: d, error } = await pe2(db.from('Inscriptions').select('email').eq('id', Number(b.id))).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!d || !d.email || !String(d.email).includes('@')) return res.status(200).json({ ok: false, raison: 'pas d\'email' });
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json',
        'Idempotency-Key': 'pe2-bravo-' + Number(b.id) },
      body: JSON.stringify({ from: FROM, to: d.email, reply_to: REPLY_TO, subject: String(b.subject || '').slice(0, 200), html: String(b.html || '') }),
    });
    if (!r.ok) return res.status(500).json({ error: 'Resend ' + r.status });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'action inconnue' });
}
