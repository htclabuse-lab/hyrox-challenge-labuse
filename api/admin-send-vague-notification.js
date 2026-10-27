import { createClient } from '@supabase/supabase-js';

// Envoie à chaque inscrit HC #3 payé un mail personnalisé avec SA vague + SON horaire.
// Dédoublonnage global des adresses (ex. mail unique si quelqu'un est inscrit dans plusieurs équipes).

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { password, dry_run, limit, extra_emails_test } = req.body || {};
  if (!password || password !== process.env.JUGES_PASSWORD) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: 'RESEND_API_KEY non configurée' });

  const FROM = 'Hyrox Challenge La Buse <noreply@htclabuse.fr>';
  const REPLY_TO = 'htclabuse@gmail.com';

  const supabase = createClient(
    'https://mzyfnmjzlosranptwucr.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  const { data: inscriptions, error: fetchErr } = await supabase
    .from('Inscriptions')
    .select('id, prenom, nom, email, co1_prenom, co1_nom, co1_email, categorie, nom_equipe, vague, heure_depart')
    .eq('statut_paiement', 'paye')
    .gte('heure_depart', '2026-11-15')
    .lt('heure_depart', '2026-11-16')
    .not('vague', 'is', null)
    .order('vague');

  if (fetchErr) return res.status(500).json({ error: 'Erreur lecture: ' + fetchErr.message });

  const hc3 = (inscriptions || []).filter(i => {
    const c = (i.categorie || '').toLowerCase();
    return !c.includes('parent') && !c.includes('kids') && !c.includes('bénévole');
  });

  // Formatte "HH:MM" Réunion
  const fmtHeure = (iso) => {
    try {
      return new Date(iso).toLocaleTimeString('fr-FR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Reunion'
      });
    } catch { return ''; }
  };

  // Construit le HTML personnalisé pour une inscription
  function buildHtml(ins) {
    const heure = fmtHeure(ins.heure_depart);
    const equipe = ins.nom_equipe ? `<div style="color:#aaa;font-size:14px;margin-top:4px;">Équipe <strong style="color:#fff;">${escapeHtml(ins.nom_equipe)}</strong></div>` : '';
    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;">
<div style="max-width:600px;margin:0 auto;padding:30px 20px;">
  <div style="background:#111;border:2px solid #FFEE00;border-radius:16px;padding:30px 24px;text-align:center;">
    <h1 style="font-size:24px;color:#FFEE00;margin:0 0 20px;line-height:1.3;">🏁 Ta vague de départ HC #3</h1>
    <p style="font-size:15px;line-height:1.6;color:#ddd;margin:0 0 20px;">Les vagues de l'<strong style="color:#fff;">Hyrox Challenge La Buse #3</strong> — dimanche 15 novembre — sont en ligne.</p>

    <div style="background:#0d1400;border:2px solid #FFEE00;border-radius:12px;padding:20px 16px;margin:20px 0;">
      <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1.5px;font-weight:800;">Ta vague</div>
      <div style="font-size:38px;color:#FFEE00;font-weight:900;margin:6px 0 2px;letter-spacing:-0.5px;">Vague ${ins.vague}</div>
      <div style="font-size:24px;color:#fff;font-weight:800;">${heure}</div>
      <div style="color:#aaa;font-size:13px;margin-top:10px;">${escapeHtml(ins.categorie || '')}</div>
      ${equipe}
    </div>

    <div style="background:#2a1a00;border:1px solid #FFA726;border-radius:8px;padding:10px 14px;margin:16px 0;font-size:13px;color:#FFA726;">⚠️ Horaire <strong>provisoire</strong>. Des ajustements à la marge restent possibles.</div>

    <p style="font-size:15px;line-height:1.6;color:#ddd;margin:16px 0;"><strong style="color:#fff;">Venez récupérer votre package avant le départ.</strong></p>

    <a href="https://hyrox-challenge-labuse.vercel.app/#vagues" style="display:inline-block;background:#FFEE00;color:#0a0a0a;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:800;font-size:16px;margin:16px 0;">👉 Voir toutes les vagues</a>

    <p style="font-size:14px;color:#FFEE00;font-weight:700;margin-top:14px;">On a hâte 🔥<br>L'équipe HTC La Buse</p>
  </div>
  <div style="font-size:12px;color:#888;text-align:center;margin-top:20px;line-height:1.5;">Hyrox Training Club La Buse · Saint-Paul, La Réunion<br>Pour toute question : <a href="mailto:htclabuse@gmail.com" style="color:#FFEE00;">htclabuse@gmail.com</a></div>
</div>
</body></html>`;
  }

  // Construire la map email → inscription (prend la 1re inscription vue si doublon email)
  // Chaque inscription produit 1 ou 2 destinataires (principal + co1 si présent).
  const subject = '🏁 Ta vague de départ — Hyrox Challenge La Buse #3';
  const emailToHtml = new Map(); // email → html personnalisé
  const emailToVague = new Map(); // email → V/heure (pour debug)
  for (const ins of hc3) {
    const html = buildHtml(ins);
    const heureStr = `V${ins.vague} ${fmtHeure(ins.heure_depart)}`;
    for (const brut of [ins.email, ins.co1_email]) {
      const e = String(brut || '').trim().toLowerCase();
      if (!e || !e.includes('@')) continue;
      if (!emailToHtml.has(e)) {
        emailToHtml.set(e, html);
        emailToVague.set(e, heureStr);
      }
    }
  }

  // Pour tests isolés : liste d'adresses supplémentaires (reçoivent le mail du 1er inscrit, format demo)
  if (Array.isArray(extra_emails_test)) {
    const demo = hc3[0] ? buildHtml(hc3[0]) : null;
    if (demo) for (const e of extra_emails_test) {
      const ee = String(e || '').trim().toLowerCase();
      if (ee && ee.includes('@')) emailToHtml.set(ee, demo);
    }
  }

  const allEmails = Array.from(emailToHtml.keys());
  const cap = (typeof limit === 'number' && limit >= 0) ? limit : allEmails.length;
  const targets = allEmails.slice(0, cap);

  if (dry_run === true || cap === 0) {
    return res.status(200).json({
      success: true, dry_run: true,
      total_inscriptions: hc3.length,
      total_emails_uniques: allEmails.length,
      sample: targets.slice(0, 5).map(e => ({ email: e, vague_info: emailToVague.get(e) || 'extra_test' })),
    });
  }

  const sent = [];
  const failures = [];
  // Envoi 1 par 1 (chaque mail a un HTML différent — pas de batch Resend simple possible)
  for (const email of targets) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM, to: email, subject, html: emailToHtml.get(email), reply_to: REPLY_TO
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) failures.push({ email, status: resp.status, error: data });
      else sent.push(email);
    } catch (e) {
      failures.push({ email, error: String(e) });
    }
  }

  return res.status(200).json({
    success: failures.length === 0,
    total_inscriptions: hc3.length,
    total_emails_uniques: allEmails.length,
    sent: sent.length,
    failed: failures.length,
    sent_emails: sent,
    failures,
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
