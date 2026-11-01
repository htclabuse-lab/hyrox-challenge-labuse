// Preview du mail « bravo » qui part automatiquement quand un athlète pointe la station 8.
// Envoie une copie à une adresse de test (sans toucher au vrai flow).
//
//  POST { password, to: 'x@y.fr' }                        → données simulées
//  POST { password, to: 'x@y.fr', inscription_id: 436 }   → vrais pointages de cette fiche
//  POST { password, to: 'x@y.fr', nom_equipe: 'Les esc…' } → cherche par nom d'équipe

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mzyfnmjzlosranptwucr.supabase.co';
const STATIONS = { 1: 'Ski-Erg', 2: 'Sled Push', 3: 'Sled Pull', 4: 'Burpee Broad Jump', 5: 'Rowing', 6: 'Farmers Carry', 7: 'Sandbag Lunges', 8: 'Wall Balls' };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  const b = req.body || {};
  if (b.password !== process.env.JUGES_PASSWORD) return res.status(401).json({ error: 'Non autorisé' });
  const toEmail = String(b.to || '').trim();
  if (!toEmail.includes('@')) return res.status(400).json({ error: 'to invalide' });
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: 'Pas de resend key' });

  let inscr, segments;

  if (b.inscription_id || b.nom_equipe) {
    // Lecture des vraies données depuis la base
    if (!process.env.SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Pas de service key' });
    const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    let query = db.from('Inscriptions').select('*');
    if (b.inscription_id) query = query.eq('id', Number(b.inscription_id));
    else query = query.ilike('nom_equipe', `%${b.nom_equipe}%`);
    const { data: ins, error: eIns } = await query.limit(1).maybeSingle();
    if (eIns || !ins) return res.status(404).json({ error: 'Inscription introuvable', detail: eIns?.message });
    inscr = ins;
    if (!inscr.heure_debut_reelle) return res.status(400).json({ error: 'Pas de heure_debut_reelle sur la fiche' });
    const { data: pts, error: ePts } = await db.from('Pointages').select('*').eq('inscription_id', inscr.id).order('station');
    if (ePts) return res.status(500).json({ error: ePts.message });
    const startMs = new Date(inscr.heure_debut_reelle).getTime();
    let prevMs = startMs;
    segments = (pts || []).map(p => {
      const curMs = new Date(p.timestamp_pointage).getTime();
      const seg = {
        station: p.station,
        name: STATIONS[p.station] || `Station ${p.station}`,
        duree_s: Math.max(0, Math.floor((curMs - prevMs) / 1000)),
        pen30: p.penalite_30s || 0,
        pen5: p.penalite_5min || 0,
      };
      prevMs = curMs;
      return seg;
    });
  } else {
    // Données simulées (athlète fictif + 8 segments)
    inscr = { prenom: 'Stéphanie', nom: 'CARO (TEST)', categorie: 'Solo Femme Scaled', dossard: 999, nom_equipe: null };
    segments = [
      { station: 1, name: 'Ski-Erg',             duree_s: 420, pen30: 0, pen5: 0 },
      { station: 2, name: 'Sled Push',           duree_s: 300, pen30: 0, pen5: 0 },
      { station: 3, name: 'Sled Pull',           duree_s: 360, pen30: 1, pen5: 0 },
      { station: 4, name: 'Burpee Broad Jump',   duree_s: 500, pen30: 0, pen5: 0 },
      { station: 5, name: 'Rowing',              duree_s: 450, pen30: 0, pen5: 0 },
      { station: 6, name: 'Farmers Carry',       duree_s: 240, pen30: 0, pen5: 0 },
      { station: 7, name: 'Sandbag Lunges',      duree_s: 480, pen30: 0, pen5: 0 },
      { station: 8, name: 'Wall Balls',          duree_s: 390, pen30: 2, pen5: 0 },
    ];
  }

  const chronoS = segments.reduce((s, x) => s + x.duree_s, 0);
  const totalPen30 = segments.reduce((s, x) => s + x.pen30, 0);
  const totalPen5  = segments.reduce((s, x) => s + x.pen5,  0);
  const penTotalS  = totalPen30 * 30 + totalPen5 * 300;
  const tempsFinalS = chronoS + penTotalS;

  const html = buildBravoHtml(inscr, segments, chronoS, penTotalS, tempsFinalS);
  const subject = `[APERÇU] 🎉 BRAVO ${inscr.prenom} ! Ton temps Hyrox : ${fmtTime(tempsFinalS)}`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Hyrox Challenge La Buse <noreply@htclabuse.fr>',
      to: toEmail,
      subject,
      html,
      reply_to: 'htclabuse@gmail.com',
    }),
  });
  const data = await r.json().catch(() => ({}));
  return res.status(r.ok ? 200 : 500).json({ ok: r.ok, to: toEmail, resend: data });
}

function fmtTime(totalSec) {
  totalSec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}h ${mm}m ${ss}s`;
  return `${m}m ${ss}s`;
}

function buildBravoHtml(inscr, segments, chronoS, penTotalS, tempsFinalS) {
  const prenom = (inscr.prenom || '').trim();
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
    ? `<div style="font-size:13px;color:#C0392B;margin-top:6px;">dont pénalités : +${fmtTime(penTotalS)}</div>` : '';
  const equipe = nomEquipe ? `<div style="font-size:13px;color:#888;margin-top:6px;">🏷 Équipe : <strong style="color:#1a1a1a;">${nomEquipe}</strong></div>` : '';

  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a;line-height:1.6;">
<div style="background:linear-gradient(135deg,#C0392B,#FFEE00);padding:28px 20px;text-align:center;border-radius:12px 12px 0 0;">
<div style="font-size:56px;margin-bottom:8px;">🎉🔥🏆</div>
<h1 style="margin:0;color:#0a0a0a;font-size:28px;letter-spacing:1px;">BRAVO ${prenom} !</h1>
<p style="margin:8px 0 0;color:#0a0a0a;font-size:14px;font-weight:600;">Hyrox Challenge La Buse #3 — 15 novembre 2026</p>
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
