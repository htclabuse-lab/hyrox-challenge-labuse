import { createClient } from '@supabase/supabase-js';

// Renvoie le mail « bravo » original (avec segments par station) pour une fiche HC #3.
// Par défaut envoie uniquement au capitaine (email) — passer recipient='co1' pour le co1,
// ou 'both' pour les deux.
//   POST { password, inscription_id, recipient }

const STATION_NAMES = {
  1: 'SkiErg', 2: 'Sled Push', 3: 'Sled Pull', 4: 'Burpee Broad Jumps',
  5: 'Row', 6: "Farmer's Carry", 7: 'Sandbag Lunges', 8: 'Wall Balls',
};

const FROM = 'Hyrox Challenge La Buse <noreply@htclabuse.fr>';
const REPLY_TO = 'htclabuse@gmail.com';

function fmtTime(s) {
  if (s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function penSecOf(p) {
  if (p && p.penalite_s && p.penalite_s > 0) return p.penalite_s;
  return (p.penalite_30s || 0) * 30 + (p.penalite_5min || 0) * 300;
}

function buildBravoHtml(inscr, segments, chronoS, penTotalS, tempsFinalS) {
  const prenom = (inscr.prenom || '').trim();
  const nom = (inscr.nom || '').trim();
  const co1Prenom = (inscr.co1_prenom || '').trim();
  const co1Nom = (inscr.co1_nom || '').trim();
  const cat = inscr.categorie || '';
  const dossard = inscr.dossard;
  const nomEquipe = (inscr.nom_equipe || '').trim();
  const isDuo = cat.toLowerCase().startsWith('duo');
  const titre = (isDuo && co1Prenom) ? `${prenom} &amp; ${co1Prenom}` : prenom;
  const cardTitre = nomEquipe ? nomEquipe : ((isDuo && co1Prenom) ? `${prenom} &amp; ${co1Prenom}` : `${prenom} ${nom}`);
  const cardSub = (isDuo && co1Prenom) ? `${prenom} ${nom} &nbsp;+&nbsp; ${co1Prenom} ${co1Nom}` : '';

  const segmentsHtml = segments.map((s) => {
    const parts = [`<span style="color:#1B7B49;font-weight:800;font-family:monospace;font-size:15px;">${fmtTime(s.duree_s)}</span>`];
    if (s.pen_s && s.pen_s > 0) parts.push(`<span style="color:#C0392B;font-size:12px;">+${fmtTime(s.pen_s)} pén.</span>`);
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;">
        <span style="color:#888;">🏃 Course ${s.station} +</span> <strong>${s.name}</strong>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;">${parts.join(' ')}</td>
    </tr>`;
  }).join('');

  const penaltiesLine = penTotalS > 0
    ? `<div style="font-size:13px;color:#C0392B;margin-top:6px;">dont pénalités : +${fmtTime(penTotalS)}</div>`
    : '';
  const equipe = nomEquipe ? `<div style="font-size:13px;color:#888;margin-top:6px;">🏷 Équipe : <strong style="color:#1a1a1a;">${nomEquipe}</strong></div>` : '';

  const cardShare = `<div style="max-width:480px;margin:24px auto;background:#0a0a0a;border:4px solid #FFEE00;border-radius:20px;padding:28px 24px;text-align:center;color:#fff;font-family:Arial,sans-serif;">
<img src="https://hyrox-challenge-labuse.vercel.app/logo.jpg" alt="HTC La Buse" style="width:120px;height:auto;border-radius:12px;margin-bottom:14px;">
<div style="font-size:14px;font-weight:800;color:#FFEE00;letter-spacing:3px;text-transform:uppercase;margin-bottom:2px;">Hyrox Challenge La Buse</div>
<div style="font-size:12px;color:#aaa;letter-spacing:2px;text-transform:uppercase;margin-bottom:20px;">#3 · 15 novembre 2026</div>
<div style="font-size:22px;font-weight:900;color:#fff;margin-bottom:4px;">${cardTitre}</div>
${cardSub ? `<div style="font-size:12px;color:#aaa;margin-bottom:14px;">${cardSub}</div>` : '<div style="height:14px;"></div>'}
<div style="background:#FFEE00;color:#0a0a0a;display:inline-block;padding:6px 16px;border-radius:6px;font-weight:900;font-size:12px;letter-spacing:1.5px;margin-bottom:18px;">${cat}</div>
<div style="font-size:12px;color:#aaa;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">⏱ Temps final</div>
<div style="font-size:46px;font-weight:900;color:#FFEE00;font-family:monospace;line-height:1;">${fmtTime(tempsFinalS)}</div>
<div style="margin-top:20px;padding-top:16px;border-top:1px dashed #333;font-size:11px;color:#666;letter-spacing:1px;">#HYROX · #LABUSE · #HCLABUSE3</div>
</div>
<p style="text-align:center;font-size:12px;color:#888;margin:-10px 0 18px;font-style:italic;">📸 Fais un screenshot pour partager sur Instagram !</p>`;

  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a;line-height:1.6;">
<div style="background:linear-gradient(135deg,#C0392B,#FFEE00);padding:28px 20px;text-align:center;border-radius:12px 12px 0 0;">
<div style="font-size:56px;margin-bottom:8px;">🎉🔥🏆</div>
<h1 style="margin:0;color:#0a0a0a;font-size:28px;letter-spacing:1px;">BRAVO ${titre} !</h1>
<p style="margin:8px 0 0;color:#0a0a0a;font-size:14px;font-weight:600;">Hyrox Challenge La Buse #3 — 15 novembre 2026</p>
</div>
<div style="background:#fff;padding:24px;border:1px solid #ddd;border-top:none;">
<p style="margin-top:0;font-size:15px;">${isDuo ? 'Vous venez' : 'Tu viens'} de terminer la course 🙌</p>

${cardShare}

<div style="background:#f0f8f3;border:3px solid #1B7B49;border-radius:14px;padding:24px;margin:20px 0;text-align:center;">
<div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">⏱ ${isDuo ? 'Votre' : 'Ton'} temps total</div>
<div style="font-size:56px;font-weight:900;color:#1B7B49;font-family:monospace;line-height:1;">${fmtTime(tempsFinalS)}</div>
<div style="margin-top:14px;background:#1B7B49;color:#fff;display:inline-block;padding:6px 14px;border-radius:6px;font-weight:800;font-size:13px;letter-spacing:1px;">Dossard #${dossard} · ${cat}</div>
${equipe}
${penaltiesLine}
</div>

<div style="background:#fafafa;border-radius:12px;padding:14px;margin:18px 0;">
<div style="font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;font-weight:700;">${isDuo ? 'Votre' : 'Ton'} détail par segment</div>
<table style="width:100%;border-collapse:collapse;">${segmentsHtml}</table>
</div>

<div style="text-align:center;margin:22px 0;">
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td style="background:#C0392B;border-radius:8px;"><a href="https://hyrox-challenge-labuse.vercel.app/live.html" style="display:inline-block;padding:14px 26px;color:#fff;text-decoration:none;font-weight:800;font-size:15px;">🏆 Voir le classement live</a></td></tr></table>
</div>

<p style="margin-bottom:0;font-size:14px;"><strong>Hyrox Training Club La Buse</strong><br>Maryan, Romuald et Stéphanie</p>
</div></div>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  try {
    const { password, inscription_id, recipient } = req.body || {};
    if (!password || password !== process.env.JUGES_PASSWORD) return res.status(401).json({ error: 'Non autorisé' });
    if (!Number.isInteger(inscription_id) || inscription_id <= 0) return res.status(400).json({ error: 'inscription_id invalide' });
    const supabase = createClient('https://mzyfnmjzlosranptwucr.supabase.co', process.env.SUPABASE_SERVICE_KEY);
    const { data: inscr, error: iErr } = await supabase.from('Inscriptions').select('*').eq('id', inscription_id).single();
    if (iErr || !inscr) return res.status(404).json({ error: 'Inscription introuvable' });
    if (!inscr.heure_debut_reelle) return res.status(400).json({ error: 'Pas de heure_debut_reelle' });
    const { data: pointages, error: pErr } = await supabase.from('Pointages')
      .select('station, timestamp_pointage, penalite_30s, penalite_5min, penalite_s')
      .eq('inscription_id', inscription_id)
      .order('station', { ascending: true });
    if (pErr) return res.status(500).json({ error: 'Erreur lecture pointages' });
    const byStation = {};
    for (const p of pointages || []) byStation[p.station] = p;
    if (!byStation[8]) return res.status(400).json({ error: 'Station 8 pas encore pointée' });

    const startMs = new Date(inscr.heure_debut_reelle).getTime();
    let prevMs = startMs;
    const segments = [];
    let penTotalS = 0;
    for (let s = 1; s <= 8; s++) {
      const p = byStation[s];
      if (!p) return res.status(400).json({ error: `Station ${s} manquante` });
      const ts = new Date(p.timestamp_pointage).getTime();
      segments.push({ station: s, name: STATION_NAMES[s], duree_s: Math.round((ts - prevMs) / 1000), pen_s: penSecOf(p) });
      penTotalS += penSecOf(p);
      prevMs = ts;
    }
    const chronoS = Math.round((new Date(byStation[8].timestamp_pointage).getTime() - startMs) / 1000);
    const tempsFinalS = inscr.temps_final_s || (chronoS + penTotalS);

    const html = buildBravoHtml(inscr, segments, chronoS, penTotalS, tempsFinalS);
    const prenom = (inscr.prenom || '').trim();
    const co1Prenom = (inscr.co1_prenom || '').trim();
    const isDuo = (inscr.categorie || '').toLowerCase().startsWith('duo');
    const titre = (isDuo && co1Prenom) ? `${prenom} & ${co1Prenom}` : prenom;
    const subject = `🎉 BRAVO ${titre} ! Ton temps Hyrox : ${fmtTime(tempsFinalS)}`;

    const dest = [];
    const who = recipient || 'capitaine';
    if ((who === 'capitaine' || who === 'both') && inscr.email && inscr.email.includes('@')) dest.push(inscr.email);
    if (isDuo && (who === 'co1' || who === 'both') && inscr.co1_email && String(inscr.co1_email).includes('@')) dest.push(inscr.co1_email);
    if (!dest.length) return res.status(400).json({ error: 'Pas de destinataire valide' });

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return res.status(500).json({ error: 'RESEND_API_KEY manquant' });
    const key = `hc3-bravoresend-${inscription_id}-${who}-${Date.now()}`;
    const r = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(dest.map(to => ({ from: FROM, to, reply_to: REPLY_TO, subject, html }))),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(500).json({ error: 'Resend ' + r.status, detail: j });
    return res.status(200).json({ success: true, envoyes: dest, tempsFinal: fmtTime(tempsFinalS) });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur: ' + err.message });
  }
}
