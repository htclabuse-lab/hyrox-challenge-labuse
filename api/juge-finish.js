import { createClient } from '@supabase/supabase-js';

const STATION_NAMES = {
  1: 'SkiErg',
  2: 'Sled Push',
  3: 'Sled Pull',
  4: 'Burpee Broad Jumps',
  5: 'Row',
  6: "Farmer's Carry",
  7: 'Sandbag Lunges',
  8: 'Wall Balls',
};

function fmtTime(s) {
  if (s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { password, inscription_id } = req.body || {};

    if (!password || password !== process.env.JUGES_PASSWORD) {
      return res.status(401).json({ error: 'Non autorisé' });
    }
    if (!Number.isInteger(inscription_id) || inscription_id <= 0) {
      return res.status(400).json({ error: 'inscription_id invalide' });
    }

    const supabaseUrl = 'https://mzyfnmjzlosranptwucr.supabase.co';
    const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY);

    // Fetch inscription
    const { data: inscr, error: iErr } = await supabase
      .from('Inscriptions')
      .select('*')
      .eq('id', inscription_id)
      .single();
    if (iErr || !inscr) return res.status(404).json({ error: 'Inscription introuvable' });
    if (!inscr.heure_debut_reelle) return res.status(400).json({ error: 'Vague non démarrée (heure_debut_reelle manquante)' });

    // Fetch all pointages for this inscription
    const { data: pointages, error: pErr } = await supabase
      .from('Pointages')
      .select('station, timestamp_pointage, penalite_30s, penalite_5min')
      .eq('inscription_id', inscription_id)
      .order('station', { ascending: true });
    if (pErr) return res.status(500).json({ error: 'Erreur lecture pointages' });

    const byStation = {};
    for (const p of pointages || []) byStation[p.station] = p;
    if (!byStation[8]) return res.status(400).json({ error: 'Station 8 pas encore pointée' });

    // Calcul temps par segment (course + station)
    const startMs = new Date(inscr.heure_debut_reelle).getTime();
    let prevMs = startMs;
    const segments = [];
    let totalPen30 = 0, totalPen5 = 0;
    for (let s = 1; s <= 8; s++) {
      const p = byStation[s];
      if (!p) return res.status(400).json({ error: `Station ${s} manquante` });
      const ts = new Date(p.timestamp_pointage).getTime();
      const durS = Math.round((ts - prevMs) / 1000);
      const pen30 = p.penalite_30s || 0;
      const pen5 = p.penalite_5min || 0;
      totalPen30 += pen30;
      totalPen5 += pen5;
      segments.push({ station: s, name: STATION_NAMES[s], duree_s: durS, pen30, pen5 });
      prevMs = ts;
    }

    const chronoS = Math.round((new Date(byStation[8].timestamp_pointage).getTime() - startMs) / 1000);
    const penTotalS = totalPen30 * 30 + totalPen5 * 300;
    const tempsFinalS = chronoS + penTotalS;

    // Stocke le temps final
    const { error: uErr } = await supabase
      .from('Inscriptions')
      .update({ temps_final_s: tempsFinalS })
      .eq('id', inscription_id);
    if (uErr) console.error('Erreur update temps_final_s:', uErr);

    // Envoi mail bravo si email valide
    let mailStatus = 'skipped';
    if (inscr.email && inscr.email.includes('@')) {
      const html = buildBravoHtml(inscr, segments, chronoS, penTotalS, tempsFinalS);
      const subject = `🎉 BRAVO ${(inscr.prenom || '').trim()} ! Ton temps Hyrox : ${fmtTime(tempsFinalS)}`;
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        try {
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Hyrox Challenge La Buse <noreply@htclabuse.fr>',
              to: inscr.email,
              subject,
              html,
              reply_to: 'htclabuse@gmail.com',
            }),
          });
          mailStatus = r.ok ? 'sent' : `error_${r.status}`;
        } catch (e) {
          mailStatus = 'exception';
        }
      } else {
        mailStatus = 'no_api_key';
      }
    }

    return res.status(200).json({
      success: true,
      inscription_id,
      temps_final_s: tempsFinalS,
      chrono_s: chronoS,
      penalites_s: penTotalS,
      segments,
      mail: mailStatus,
    });
  } catch (err) {
    console.error('Erreur juge-finish:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

function buildBravoHtml(inscr, segments, chronoS, penTotalS, tempsFinalS) {
  const prenom = (inscr.prenom || '').trim();
  const nom = (inscr.nom || '').trim();
  const cat = inscr.categorie || '';
  const dossard = inscr.dossard;
  const nomEquipe = inscr.nom_equipe;

  const segmentsHtml = segments.map((s) => {
    const parts = [`<span style="color:#1B7B49;font-weight:800;font-family:monospace;font-size:15px;">${fmtTime(s.duree_s)}</span>`];
    if (s.pen30 > 0) parts.push(`<span style="color:#C0392B;font-size:12px;">+${s.pen30}×30s</span>`);
    if (s.pen5 > 0) parts.push(`<span style="color:#C0392B;font-size:12px;">+${s.pen5}×5min</span>`);
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

  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a;line-height:1.6;">
<div style="background:linear-gradient(135deg,#C0392B,#FFEE00);padding:28px 20px;text-align:center;border-radius:12px 12px 0 0;">
<div style="font-size:56px;margin-bottom:8px;">🎉🔥🏆</div>
<h1 style="margin:0;color:#0a0a0a;font-size:28px;letter-spacing:1px;">BRAVO ${prenom} !</h1>
<p style="margin:8px 0 0;color:#0a0a0a;font-size:14px;font-weight:600;">Hyrox Challenge La Buse — 12 juillet 2026</p>
</div>
<div style="background:#fff;padding:24px;border:1px solid #ddd;border-top:none;">
<p style="margin-top:0;font-size:15px;">Tu viens de terminer la course 🙌</p>

<div style="background:#f0f8f3;border:3px solid #1B7B49;border-radius:14px;padding:24px;margin:20px 0;text-align:center;">
<div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">⏱ Ton temps total</div>
<div style="font-size:56px;font-weight:900;color:#1B7B49;font-family:monospace;line-height:1;">${fmtTime(tempsFinalS)}</div>
<div style="margin-top:14px;background:#1B7B49;color:#fff;display:inline-block;padding:6px 14px;border-radius:6px;font-weight:800;font-size:13px;letter-spacing:1px;">Dossard #${dossard} · ${cat}</div>
${equipe}
${penaltiesLine}
</div>

<div style="background:#fafafa;border-radius:12px;padding:14px;margin:18px 0;">
<div style="font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;font-weight:700;">Ton détail par segment</div>
<table style="width:100%;border-collapse:collapse;">${segmentsHtml}</table>
</div>

<div style="background:#f0f8f3;border:2px solid #1B7B49;border-radius:12px;padding:16px;margin:20px 0;">
<div style="font-size:13px;color:#1B7B49;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;text-align:center;">📱 À découvrir</div>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;">
<tr><td style="padding:6px 0;"><table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td style="background:#C0392B;border-radius:8px;"><a href="https://hyrox-challenge-labuse.vercel.app/live.html" style="display:inline-block;padding:12px 20px;color:#fff;text-decoration:none;font-weight:800;font-size:14px;">🏆 Voir le classement live</a></td></tr></table></td></tr>
<tr><td style="padding:6px 0;"><table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td style="background:#FFEE00;border-radius:8px;"><a href="https://hyrox-challenge-labuse.vercel.app/resultats.html" style="display:inline-block;padding:12px 20px;color:#0a0a0a;text-decoration:none;font-weight:800;font-size:14px;">📊 Retrouver mes résultats</a></td></tr></table></td></tr>
</table>
</div>

<div style="background:#1a1a1a;color:#fff;border-radius:12px;padding:20px;margin:18px 0;text-align:center;">
<div style="font-size:12px;color:#FFEE00;text-transform:uppercase;letter-spacing:2px;font-weight:800;margin-bottom:6px;">✨ Tu as aimé ? ✨</div>
<div style="font-size:18px;font-weight:900;margin-bottom:12px;">Continue avec le HYROX Training Club La Buse !</div>
<p style="font-size:13px;color:#ccc;line-height:1.6;margin-bottom:14px;">Réserve ta <strong style="color:#FFEE00;">séance d'essai gratuite</strong> et découvre notre salle et nos coachs.</p>
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td style="background:#1B7B49;border-radius:8px;">
<a href="https://wodz.app/form/contact/crossfit-la-buse-tester-crossfit-la-buse-2" style="display:inline-block;padding:14px 26px;color:#fff;text-decoration:none;font-weight:800;font-size:15px;">💪 Réserve ta séance d'essai</a>
</td></tr></table>
<div style="border-top:1px solid #333;margin:16px 0;"></div>
<div style="font-size:13px;color:#ccc;line-height:1.6;margin-bottom:12px;">Tu as un enfant qui veut s'y mettre ?<br>Nos <strong style="color:#FFEE00;">cours Hyrox Kids</strong> démarrent le 1<sup>er</sup> septembre.</div>
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td style="background:#FFA726;border-radius:8px;">
<a href="https://hyrox-challenge-labuse.vercel.app/kids-preinscription.html" style="display:inline-block;padding:12px 22px;color:#0a0a0a;text-decoration:none;font-weight:800;font-size:14px;">🧒 Pré-inscrire mon enfant</a>
</td></tr></table>
</div>

<p style="font-size:15px;font-weight:700;color:#C0392B;margin:20px 0 0;">Chapeau ! 🎉</p>
<p style="margin-bottom:0;font-size:14px;">Repose-toi bien 💪<br><strong>L'équipe Hyrox La Buse</strong></p>
</div>
<div style="text-align:center;padding:12px;font-size:11px;color:#999;">Hyrox Training Club La Buse — Crossfit La Buse, Saint-Paul, La Réunion</div>
</div>`;
}
