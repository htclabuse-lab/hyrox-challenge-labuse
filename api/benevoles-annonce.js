import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../lib/kids.js';

// ============================================================================
// Mail aux bénévoles de l'HC #2 pour leur proposer de revenir sur l'HC #3.
//
//  POST { password, dry_run: true }       → liste + nombre, RIEN n'est envoyé
//  POST { password, test_to: 'x@y.fr' }   → 1 seul mail, à cette adresse
//  POST { password, envoyer: true }       → envoi réel (Resend, par lots de 100)
//
// Destinataires = bénévoles créés avant 2026-09-01 (HC #2),
// dédoublonnés par email, exclusions : déjà réinscrits HC #3 + Stéphanie elle-même.
// ============================================================================

const CUTOFF = '2026-09-01';
const EXCLUS = ['stephanie.caro31@gmail.com'];
const FROM = 'Hyrox La Buse <noreply@htclabuse.fr>';
const REPLY_TO = 'htclabuse@gmail.com';

function mailBenevHc2(prenom) {
  const salut = prenom ? 'Salut <strong>' + prenom + '</strong>,' : 'Salut à vous,';
  return {
    subject: '🙌 Hyrox Challenge La Buse #3 — on te veut encore avec nous !',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + '<p>' + salut + '</p>'
      + '<p>Un énorme <strong>MERCI</strong> encore une fois pour ton coup de main sur l\'<strong>HC #2</strong> en juillet dernier — l\'événement n\'aurait pas eu la même énergie sans la Team Staff La Buse ! 💛🖤</p>'
      + '<p>On remet ça : <strong>Hyrox Challenge La Buse #3</strong>, c\'est le <strong>dimanche 15 novembre 2026</strong>. Et la <strong>veille, samedi 14 novembre après-midi</strong>, on a notre <strong>deuxième événement Parent-Enfant</strong> où on a aussi besoin de monde.</p>'
      + '<p>On aurait vraiment envie de te retrouver dans l\'équipe. Pour celles et ceux qui s\'engagent, Romu a prévu de belles dotations :</p>'
      + '<p><strong>Demi-journée (matin OU après-midi)</strong><br>👕 T-shirt STAFF La Buse<br>🥐 Collation<br>🏷️ Carnet INTERSPORT 20 %</p>'
      + '<p><strong>Journée complète (avec vraie pause déjeuner)</strong><br>Tout ce qui est ci-dessus<br>🍽 Repas offert sur place<br>💶 Bon HTC La Buse 20 €</p>'
      + '<p><strong>Pour t\'inscrire</strong> (ça prend 2 minutes, tu choisis tes dispos et ta taille de t-shirt) :<br>👉 <a href="https://hyrox-challenge-labuse.vercel.app/benevoles.html">https://hyrox-challenge-labuse.vercel.app/benevoles.html</a></p>'
      + '<p>⚠️ Petit rappel : le t-shirt STAFF taille petit, pense à prendre une taille au-dessus.</p>'
      + '<p>Les horaires exacts sont encore à affiner, mais on t\'enverra tout ça dès que ce sera calé.</p>'
      + '<p>On croise les doigts pour te revoir ! 🫶</p>'
      + '<p><strong>Stéphanie &amp; l\'équipe La Buse</strong></p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
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

  try {
    const db = createClient(SUPABASE_URL, serviceKey);
    const { data, error } = await db.from('Benevoles').select('id,prenom,nom,email,created_at');
    if (error) return res.status(500).json({ error: error.message });
    const em = r => String(r.email || '').trim().toLowerCase();

    const hc2 = (data || []).filter(r => (r.created_at || '') < CUTOFF && em(r));
    const hc3 = new Set((data || []).filter(r => (r.created_at || '') >= CUTOFF).map(em));

    const parEmail = {};
    hc2.forEach(r => {
      const e = em(r);
      if (hc3.has(e) || EXCLUS.includes(e)) return;
      (parEmail[e] = parEmail[e] || []).push(r);
    });
    const emails = Object.keys(parEmail).sort();
    const prenomDe = e => {
      const prenoms = [...new Set(parEmail[e].map(f => (f.prenom || '').trim()).filter(Boolean))];
      return prenoms.length === 1 ? prenoms[0] : null;
    };

    if (b.test_to) {
      const n = await resendBatch(resendKey,
        [{ from: FROM, to: String(b.test_to).trim(), reply_to: REPLY_TO, ...mailBenevHc2('Stéphanie (TEST)') }],
        `benev-hc2-test-${Date.now()}`);
      return res.status(200).json({ test: true, envoyes: n, nb_destinataires_reels: emails.length });
    }

    if (b.envoyer !== true) {
      return res.status(200).json({
        dry_run: true,
        nombre: emails.length,
        destinataires: emails.map(e => ({
          email: e,
          salut_avec: prenomDe(e) || '«Salut à vous»',
          fiches_regroupees: parEmail[e].map(f => (f.prenom || '?') + ' ' + (f.nom || '')),
        })),
      });
    }

    let envoyes = 0;
    for (let i = 0; i < emails.length; i += 100) {
      envoyes += await resendBatch(resendKey,
        emails.slice(i, i + 100).map(to => ({ from: FROM, to, reply_to: REPLY_TO, ...mailBenevHc2(prenomDe(to)) })),
        `benev-hc2-lot${i / 100}-v1`);
    }
    return res.status(200).json({ envoye: true, nombre: emails.length, envoyes });
  } catch (e) {
    console.error('benevoles-annonce', e);
    return res.status(500).json({ error: e.message });
  }
}
