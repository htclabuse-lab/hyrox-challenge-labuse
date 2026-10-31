import { createClient } from '@supabase/supabase-js';

// ============================================================================
// Relance automatique des paniers abandonnés HC #3.
//
// Déclenché par un cron Vercel (voir vercel.json) une fois par heure. Pour
// chaque inscription HC #3 restée en "en_attente" depuis plus de 2 heures, sans
// paiement finalisé et jamais encore relancée, envoie un mail « ton inscription
// t'attend » puis marque la ligne (relance_envoyee_at) pour ne pas la renvoyer.
//
// Garde-fous, identiques à la relance manuelle :
//  - délai : au moins 2 h après création (sinon on relancerait un paiement en cours)
//  - HC #3 uniquement (créées depuis l'ouverture, hors Kids et Parent-Enfant)
//  - email valide requis
//  - exclut les personnes qui ont DÉJÀ payé une inscription HC #3 (même mail/tel)
//  - une seule relance par inscription (relance_envoyee_at)
//
// Auth : appel cron Vercel (Authorization: Bearer CRON_SECRET) OU manuel avec
// ?key=<JUGES_PASSWORD>. Ajoute &dry_run=1 pour simuler sans envoyer.
// ============================================================================

const OUVERTURE_HC3 = '2026-07-19';   // date d'ouverture des inscriptions HC #3
const DELAI_HEURES = 2;               // délai avant de considérer un panier abandonné
const FROM = 'Hyrox Challenge La Buse <noreply@htclabuse.fr>';
const REPLY_TO = 'htclabuse@gmail.com';
const LIEN = 'https://hyrox-challenge-labuse.vercel.app/#accueil';

function norm(v) { return String(v || '').trim().toLowerCase(); }
function emailValide(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm(e)); }

function estHC3(r) {
  const cat = (r.categorie || '').toLowerCase();
  if (cat.includes('kids') || cat.includes('parent')) return false;
  return (r.created_at || '') >= OUVERTURE_HC3;
}

function buildRelanceHtml(prenom) {
  const p = (prenom || '').trim() || 'à toi';
  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#fff;padding:2rem 1.5rem;border-radius:12px;">
  <div style="text-align:center;margin-bottom:1.25rem;">
    <div style="font-size:12px;color:#888;letter-spacing:2px;text-transform:uppercase;font-weight:800;">Hyrox Training Club La Buse</div>
  </div>
  <h2 style="color:#FFEE00;font-size:22px;margin:0 0 1rem;">Ton inscription t'attend 👀</h2>
  <p style="color:#ddd;font-size:15px;line-height:1.7;margin:0 0 1.25rem;">
    Salut <strong style="color:#fff;">${p}</strong>,<br><br>
    On a vu que tu avais commencé ton inscription au <strong style="color:#fff;">Hyrox Challenge La Buse #3</strong> (dimanche 15 novembre 2026) — mais elle n'a pas été finalisée.<br><br>
    Les places partent vite, alors si tu veux en être, il ne te reste qu'une étape 👇
  </p>
  <div style="text-align:center;margin:1.5rem 0;">
    <a href="${LIEN}" style="display:inline-block;background:#FFEE00;color:#0a0a0a;font-weight:900;font-size:17px;padding:15px 40px;border-radius:10px;text-decoration:none;">🔥 Finaliser mon inscription</a>
  </div>
  <p style="color:#ddd;font-size:15px;line-height:1.7;margin:1.25rem 0 0;">
    À très vite sur la ligne de départ 💪<br>
    <strong style="color:#FFEE00;">L'équipe HTC La Buse</strong>
  </p>
  <p style="color:#555;font-size:11px;text-align:center;margin-top:2rem;border-top:1px solid #222;padding-top:1.25rem;">
    Hyrox Training Club La Buse — Saint-Paul, La Réunion<br>
    <a href="${LIEN}" style="color:#888;text-decoration:none;">hyrox-challenge-labuse.vercel.app</a>
  </p>
</div>`;
}

export default async function handler(req, res) {
  // --- Authentification : cron Vercel OU déclenchement manuel ---
  const cronOk = process.env.CRON_SECRET &&
    req.headers.authorization === 'Bearer ' + process.env.CRON_SECRET;
  const key = (req.query && req.query.key) || (req.body && req.body.key);
  const manuelOk = process.env.JUGES_PASSWORD && key === process.env.JUGES_PASSWORD;
  if (!cronOk && !manuelOk) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const dryRun = String((req.query && req.query.dry_run) || (req.body && req.body.dry_run) || '') === '1';

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!serviceKey || !resendKey) {
    return res.status(500).json({ error: 'Configuration serveur incomplète' });
  }

  const supabase = createClient('https://mzyfnmjzlosranptwucr.supabase.co', serviceKey);
  const { data: rows, error } = await supabase
    .from('Inscriptions')
    .select('id,prenom,nom,email,telephone,categorie,statut_paiement,created_at,relance_envoyee_at');
  if (error) {
    console.error('relance-abandons: erreur lecture', error);
    return res.status(500).json({ error: 'Erreur lecture inscriptions' });
  }

  // Index des personnes ayant déjà payé une inscription HC #3 (par mail ET tél)
  const payeMail = new Set();
  const payeTel = new Set();
  for (const r of rows) {
    if (r.statut_paiement === 'paye' && estHC3(r)) {
      if (emailValide(r.email)) payeMail.add(norm(r.email));
      if (r.telephone) payeTel.add(String(r.telephone).trim());
    }
  }

  const seuil = Date.now() - DELAI_HEURES * 3600 * 1000;

  const candidats = rows.filter(function (r) {
    if (r.statut_paiement === 'paye') return false;
    if (r.relance_envoyee_at) return false;
    if (!estHC3(r)) return false;
    if (!emailValide(r.email)) return false;
    const cree = Date.parse(r.created_at || '');
    if (!(cree < seuil)) return false;                       // moins de 2 h → on attend
    if (payeMail.has(norm(r.email))) return false;           // a déjà payé HC #3
    if (r.telephone && payeTel.has(String(r.telephone).trim())) return false;
    return true;
  });

  if (dryRun) {
    return res.status(200).json({
      dry_run: true,
      candidats: candidats.length,
      details: candidats.map(function (r) {
        return { id: r.id, prenom: (r.prenom || '').trim(), email: r.email };
      }),
    });
  }

  const envoyes = [];
  const echecs = [];
  for (const r of candidats) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: r.email,
          subject: "Ton inscription au Hyrox Challenge La Buse #3 t'attend 👀",
          html: buildRelanceHtml(r.prenom),
          reply_to: REPLY_TO,
        }),
      });
      if (!resp.ok) {
        echecs.push({ id: r.id, status: resp.status });
        continue;
      }
      // Marque la ligne pour ne jamais renvoyer (même si le prochain cron repasse)
      await supabase
        .from('Inscriptions')
        .update({ relance_envoyee_at: new Date().toISOString() })
        .eq('id', r.id);
      envoyes.push({ id: r.id, email: r.email });
    } catch (e) {
      console.error('relance-abandons: envoi échoué id', r.id, e);
      echecs.push({ id: r.id, error: String(e) });
    }
  }

  return res.status(200).json({ candidats: candidats.length, envoyes: envoyes.length, echecs, details: envoyes });
}
