import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../lib/kids.js';

// ============================================================================
// Mail « tes photos sont en ligne » aux inscrits payés de PE #2 et HC #3 (20/11/2026).
// Un mail par événement, dédoublonné par email (inscrit principal + co1).
// Mêmes inscrits que ceux reconnus par photos.html (created_at >= inscriptions_depuis,
// payés, Parent-Enfant d'un côté / hors Parent-Enfant et Kids de l'autre).
//
//  POST { password, dry_run: true }        → nombre de destinataires par événement (rien n'est envoyé)
//  POST { password, test_to: 'x@y.fr' }   → les 2 versions (PE + HC) à cette seule adresse
//  POST { password, envoyer: true }        → envoi réel à tous (clés d'idempotence : pas de double envoi)
//
// Protégé par PHOTOS_ADMIN_PASSWORD.
// ============================================================================

const FROM = 'Hyrox Challenge La Buse <noreply@htclabuse.fr>';
const REPLY_TO = 'htclabuse@gmail.com';
const SITE = 'https://hyrox-challenge-labuse.vercel.app/#accueil';
const EVENEMENTS = ['pe2', 'hc3'];

const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function mailPhotos(evtId, prenom) {
  const pe = evtId === 'pe2';
  const salut = prenom ? `Salut <strong>${esc(prenom)}</strong> !` : 'Salut à toi !';
  return {
    subject: pe ? '📸 Vos photos du Hyrox Parents / Enfants #2 sont en ligne !'
                : '📸 Tes photos du Hyrox Challenge La Buse #3 sont en ligne !',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + `<p>${salut}</p>`
      + (pe ? '<p>Les photos du <strong>Hyrox Parents / Enfants #2</strong> sont en ligne 👨‍👧</p>'
            : '<p>Les photos du <strong>Hyrox Challenge La Buse #3</strong> sont en ligne 🔥</p>')
      + '<p>👉 Rendez-vous sur le site, onglet <strong>📅 Nos évènements</strong>, puis <strong>📸 Retrouve tes photos</strong> :<br>'
      + `<a href="${SITE}">${SITE}</a></p>`
      + '<p><strong>Comment ça marche :</strong></p>'
      + '<ol style="padding-left:20px;margin:0 0 14px;">'
      + '<li style="margin-bottom:6px;">Entre <strong>l\'email de ton inscription</strong> (celui sur lequel tu reçois ce mail).</li>'
      + '<li style="margin-bottom:6px;">Parcours toutes les photos de l\'événement. Tu peux aussi faire un <strong>selfie</strong> pour qu\'on t\'aide à retrouver les tiennes : ton selfie reste sur ton téléphone, il n\'est ni envoyé ni enregistré.</li>'
      + '<li>Choisis tes photos :<br>'
      + '🎁 <strong>3 photos offertes par équipe</strong> (pour toute l\'équipe, pas 3 chacun) ;<br>'
      + '🔓 <strong>Pack photo à 20 €</strong> pour toute l\'équipe : tes photos en HD, sans filigrane.</li>'
      + '</ol>'
      + '<p>Tu as déjà pris le pack photo ? Entre simplement ton email et sélectionne tes photos.</p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:12px 16px;margin:14px 0;border-radius:4px;">'
      + '⚠️ La reconnaissance par selfie n\'est pas parfaite : pense à parcourir toutes les photos pour ne rien rater !'
      + '</div>'
      + '<p>Merci encore d\'avoir été là, et à très vite 💛🖤</p>'
      + '<p><strong>Hyrox Training Club La Buse — Maryan, Romuald et Stéphanie</strong></p>'
      + '</div>',
  };
}

async function destinataires(db, evtId) {
  const { data: evt, error: e1 } = await db.from('photos_evenements').select('id,type,inscriptions_depuis').eq('id', evtId).single();
  if (e1) throw e1;
  const { data, error } = await db.from('Inscriptions')
    .select('id,prenom,email,co1_prenom,co1_email,categorie,statut_paiement')
    .gte('created_at', evt.inscriptions_depuis);
  if (error) throw error;
  const parEmail = {};
  for (const r of data || []) {
    const statut = String(r.statut_paiement || '').toLowerCase();
    if (statut !== 'paye' && statut !== 'payé') continue;
    const cat = String(r.categorie || '');
    if (evt.type === 'parent_enfant' ? cat !== 'Parent-Enfant' : (cat === 'Parent-Enfant' || cat.toLowerCase().includes('kids'))) continue;
    for (const [prenom, email] of [[r.prenom, r.email], [r.co1_prenom, r.co1_email]]) {
      const e = String(email || '').trim().toLowerCase();
      if (!e || !e.includes('@')) continue;
      (parEmail[e] = parEmail[e] || []).push(String(prenom || '').trim());
    }
  }
  return Object.keys(parEmail).sort().map(e => {
    const prenoms = [...new Set(parEmail[e].filter(Boolean))];
    return { email: e, prenom: prenoms.length === 1 ? prenoms[0] : null };
  });
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
  if (!process.env.PHOTOS_ADMIN_PASSWORD || b.password !== process.env.PHOTOS_ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (!process.env.SUPABASE_SERVICE_KEY || !resendKey) return res.status(500).json({ error: 'Configuration serveur incomplète' });
  const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    const listes = {};
    for (const id of EVENEMENTS) listes[id] = await destinataires(db, id);

    if (b.test_to) {
      const to = String(b.test_to).trim();
      const n = await resendBatch(resendKey,
        EVENEMENTS.map(id => ({ from: FROM, to, reply_to: REPLY_TO, ...mailPhotos(id, 'Stéphanie (APERÇU)') })),
        `photos-annonce-test-${Date.now()}`);
      return res.status(200).json({ test: true, envoyes: n, destinataires_reels: Object.fromEntries(EVENEMENTS.map(id => [id, listes[id].length])) });
    }

    if (b.envoyer !== true) {
      return res.status(200).json({
        dry_run: true,
        nombre: Object.fromEntries(EVENEMENTS.map(id => [id, listes[id].length])),
        apercu: Object.fromEntries(EVENEMENTS.map(id => [id, listes[id].slice(0, 5)])),
      });
    }

    const resultat = {};
    for (const id of EVENEMENTS) {
      const liste = listes[id];
      let envoyes = 0;
      for (let i = 0; i < liste.length; i += 100) {
        envoyes += await resendBatch(resendKey,
          liste.slice(i, i + 100).map(d => ({ from: FROM, to: d.email, reply_to: REPLY_TO, ...mailPhotos(id, d.prenom) })),
          `photos-annonce-${id}-lot${i / 100}-v1`);
      }
      resultat[id] = { nombre: liste.length, envoyes };
    }
    return res.status(200).json({ envoye: true, resultat });
  } catch (e) {
    console.error('photos-annonce', e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
