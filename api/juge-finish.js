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
      .select('station, timestamp_pointage, penalite_30s, penalite_5min, penalite_s')
      .eq('inscription_id', inscription_id)
      .order('station', { ascending: true });
    if (pErr) return res.status(500).json({ error: 'Erreur lecture pointages' });

    const byStation = {};
    for (const p of pointages || []) byStation[p.station] = p;
    if (!byStation[8]) return res.status(400).json({ error: 'Station 8 pas encore pointée' });

    // Calcul temps par segment (course + station)
    // Pénalité par pointage : nouveau HC #3 utilise penalite_s (total secondes).
    // Compatibilité HC #2 : fallback sur pen30*30 + pen5*300 si penalite_s absent/0.
    function penSecOf(p) {
      if (p && p.penalite_s && p.penalite_s > 0) return p.penalite_s;
      return (p.penalite_30s || 0) * 30 + (p.penalite_5min || 0) * 300;
    }
    const startMs = new Date(inscr.heure_debut_reelle).getTime();
    let prevMs = startMs;
    const segments = [];
    let penTotalS = 0;
    for (let s = 1; s <= 8; s++) {
      const p = byStation[s];
      if (!p) return res.status(400).json({ error: `Station ${s} manquante` });
      const ts = new Date(p.timestamp_pointage).getTime();
      const durS = Math.round((ts - prevMs) / 1000);
      const segPen = penSecOf(p);
      penTotalS += segPen;
      segments.push({ station: s, name: STATION_NAMES[s], duree_s: durS, pen_s: segPen });
      prevMs = ts;
    }

    const chronoS = Math.round((new Date(byStation[8].timestamp_pointage).getTime() - startMs) / 1000);
    const tempsFinalS = chronoS + penTotalS;

    // Stocke le temps final
    const { error: uErr } = await supabase
      .from('Inscriptions')
      .update({ temps_final_s: tempsFinalS })
      .eq('id', inscription_id);
    if (uErr) console.error('Erreur update temps_final_s:', uErr);

    // Envoi mail bravo
    // ⚠️ MODE TEST : MAIL_ENABLED=true + MAIL_REDIRECT_TO force la destination
    // pour PROTÉGER les vrais athlètes pendant les tests end-to-end.
    // AVANT HC #3 : MAIL_ENABLED reste true mais MAIL_REDIRECT_TO = null pour envoi réel.
    const MAIL_ENABLED = true;
    const MAIL_REDIRECT_TO = 'stephanie.caro31@gmail.com'; // ← mettre à null le jour J pour envoyer aux vrais athlètes
    let mailStatus = 'skipped';
    // Pour les Duos : envoi aux 2 (capitaine + coéquipier) si co1_email valide.
    const isDuo = (inscr.categorie || '').toLowerCase().startsWith('duo');
    const emails = [];
    if (inscr.email && inscr.email.includes('@')) emails.push(inscr.email);
    if (isDuo && inscr.co1_email && String(inscr.co1_email).includes('@') && !emails.includes(inscr.co1_email)) {
      emails.push(inscr.co1_email);
    }
    const to = MAIL_REDIRECT_TO ? MAIL_REDIRECT_TO : emails;
    if (MAIL_ENABLED && (MAIL_REDIRECT_TO || emails.length > 0)) {
      const html = buildBravoHtml(inscr, segments, chronoS, penTotalS, tempsFinalS);
      // Titre du mail : nom(s) selon type (Duo = 2 prénoms, Solo = 1)
      const prenom = (inscr.prenom || '').trim();
      const co1Prenom = (inscr.co1_prenom || '').trim();
      const titre = (isDuo && co1Prenom) ? `${prenom} & ${co1Prenom}` : prenom;
      const subjectPrefix = MAIL_REDIRECT_TO ? '[TEST → ' + titre + '] ' : '';
      const subject = subjectPrefix + `🎉 BRAVO ${titre} ! Votre temps Hyrox : ${fmtTime(tempsFinalS)}`;
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        try {
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Hyrox Challenge La Buse <noreply@htclabuse.fr>',
              to,
              subject,
              html,
              reply_to: 'htclabuse@gmail.com',
            }),
          });
          mailStatus = r.ok ? (MAIL_REDIRECT_TO ? 'test_sent_to_' + MAIL_REDIRECT_TO : 'sent_to_' + (Array.isArray(to) ? to.join(',') : to)) : `error_${r.status}`;
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
  const co1Prenom = (inscr.co1_prenom || '').trim();
  const co1Nom = (inscr.co1_nom || '').trim();
  const cat = inscr.categorie || '';
  const dossard = inscr.dossard;
  const nomEquipe = (inscr.nom_equipe || '').trim();
  const isDuo = cat.toLowerCase().startsWith('duo');
  // Titre « BRAVO Prénom » (solo) ou « BRAVO Prénom1 & Prénom2 » (duo)
  const titre = (isDuo && co1Prenom) ? `${prenom} &amp; ${co1Prenom}` : prenom;
  // Nom affiché dans la carte partageable : nom d'équipe si fourni, sinon prénoms
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

  // Carte « partageable Instagram » — noir / jaune, bordure visible, format 4:5
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
<div style="font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px;font-weight:700;">Ton détail par segment</div>
<table style="width:100%;border-collapse:collapse;">${segmentsHtml}</table>
</div>

<div style="text-align:center;margin:22px 0;">
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td style="background:#C0392B;border-radius:8px;"><a href="https://hyrox-challenge-labuse.vercel.app/live.html" style="display:inline-block;padding:14px 26px;color:#fff;text-decoration:none;font-weight:800;font-size:15px;">🏆 Voir le classement live</a></td></tr></table>
</div>

<div style="background:#1a1a1a;color:#fff;border-radius:12px;padding:20px;margin:18px 0;text-align:center;">
<div style="font-size:12px;color:#FFEE00;text-transform:uppercase;letter-spacing:2px;font-weight:800;margin-bottom:6px;">✨ Tu as aimé ? ✨</div>
<div style="font-size:18px;font-weight:900;margin-bottom:12px;">Continue avec le HYROX Training Club La Buse !</div>
<p style="font-size:13px;color:#ccc;line-height:1.6;margin-bottom:14px;">Réserve ta <strong style="color:#FFEE00;">séance d'essai gratuite</strong> et découvre notre salle et nos coachs.</p>
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td style="background:#1B7B49;border-radius:8px;">
<a href="https://wodz.app/form/contact/crossfit-la-buse-tester-crossfit-la-buse-2" style="display:inline-block;padding:14px 26px;color:#fff;text-decoration:none;font-weight:800;font-size:15px;">💪 Réserve ta séance d'essai</a>
</td></tr></table>
<div style="border-top:1px solid #333;margin:16px 0;"></div>
<div style="font-size:13px;color:#ccc;line-height:1.6;margin-bottom:12px;">Tu as un enfant qui veut s'y mettre ?<br>Nos <strong style="color:#FFEE00;">cours Hyrox Kids</strong> (6-9 ans et 10-14 ans) le samedi.</div>
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td style="background:#FFA726;border-radius:8px;">
<a href="https://hyrox-challenge-labuse.vercel.app/kids-inscription.html" style="display:inline-block;padding:12px 22px;color:#0a0a0a;text-decoration:none;font-weight:800;font-size:14px;">🧒 Inscrire mon enfant</a>
</td></tr></table>
</div>

<p style="font-size:15px;font-weight:700;color:#C0392B;margin:20px 0 0;">Chapeau ! 🎉</p>
<p style="margin-bottom:0;font-size:14px;">Repose-toi bien 💪<br><strong>L'équipe Hyrox La Buse</strong></p>
</div>
<div style="text-align:center;padding:12px;font-size:11px;color:#999;">Hyrox Training Club La Buse — Crossfit La Buse, La Réunion</div>
</div>`;
}
