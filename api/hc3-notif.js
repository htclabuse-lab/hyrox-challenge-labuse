import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../lib/kids.js';

// ============================================================================
// Mails de notification HC #3 — deux modes :
//
// 1) VAGUE_CHANGE : prévient quelqu'un que son numéro de vague a changé.
//    POST { password, mode: 'vague_change', ids: [771, 318, ...], dry_run: true }
//    POST { password, mode: 'vague_change', ids: [...], test_to: 'x@y.fr' }
//    POST { password, mode: 'vague_change', ids: [...], envoyer: true }
//    Lit la vague/heure actuelle de chaque fiche dans la base (pas de donnée en entrée).
//
// 2) CATEGORIE_CHANGE : confirme un changement de catégorie (vague inchangée).
//    POST { password, mode: 'categorie_change', id: 680, ancienne_categorie: 'Solo Femme Scaled', test_to | envoyer }
//    Un seul destinataire.
// ============================================================================

const FROM = 'Hyrox Challenge La Buse <noreply@htclabuse.fr>';
const REPLY_TO = 'htclabuse@gmail.com';

function heureLocale(iso) {
  // 2026-11-15T04:30:00+00:00 → "08h30" (La Réunion = UTC+4)
  if (!iso) return '—';
  const h = parseInt(iso.substr(11, 2), 10);
  const m = iso.substr(14, 2);
  return `${(h + 4) % 24}h${m}`;
}

function mailVagueChange(fiche) {
  const prenom = (fiche.prenom || '').trim();
  const vague = fiche.vague;
  const h = heureLocale(fiche.heure_depart);
  return {
    subject: '⏱ Hyrox Challenge La Buse #3 — ta vague a changé',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + `<p>Salut <strong>${prenom}</strong>,</p>`
      + '<p>Petit ajustement de dernière minute sur l\'organisation des vagues HC #3 pour mieux équilibrer les catégories dans chaque départ.</p>'
      + '<p><strong>Ta nouvelle vague :</strong></p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:10px 0;border-radius:4px;">'
      + `<div style="font-size:20px;font-weight:800;color:#C0392B;">Vague ${vague} — ${h}</div>`
      + '<div style="font-size:13px;color:#666;margin-top:4px;">Dimanche 15 novembre 2026</div>'
      + '</div>'
      + '<p>C\'est le seul changement — ta catégorie, ton t-shirt et ton pack sont inchangés.</p>'
      + '<p>Désolé pour la petite modif, et à très vite ! 💛🖤</p>'
      + '<p><strong>Stéphanie &amp; l\'équipe La Buse</strong></p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailCategorieChange(fiche, ancienne) {
  const prenom = (fiche.prenom || '').trim();
  const h = heureLocale(fiche.heure_depart);
  return {
    subject: '✅ Hyrox Challenge La Buse #3 — ta catégorie est modifiée',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + `<p>Salut <strong>${prenom}</strong>,</p>`
      + '<p>C\'est bien noté, ton changement de catégorie est fait :</p>'
      + '<div style="background:#E8F5E9;border-left:4px solid #4caf50;padding:14px 18px;margin:10px 0;border-radius:4px;">'
      + `<div style="font-size:15px;color:#666;text-decoration:line-through;">${ancienne}</div>`
      + `<div style="font-size:20px;font-weight:800;color:#2e7d32;">→ ${fiche.categorie}</div>`
      + '</div>'
      + '<p>Ta vague et ton horaire restent les mêmes :</p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:10px 0;border-radius:4px;">'
      + `<div style="font-size:18px;font-weight:800;color:#C0392B;">Vague ${fiche.vague} — ${h}</div>`
      + '<div style="font-size:13px;color:#666;margin-top:4px;">Dimanche 15 novembre 2026</div>'
      + '</div>'
      + '<p>À très vite pour l\'événement ! 💛🖤</p>'
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

  const db = createClient(SUPABASE_URL, serviceKey);

  try {
    if (b.mode === 'vague_change') {
      const ids = (b.ids || []).map(Number).filter(Boolean);
      if (!ids.length) return res.status(400).json({ error: 'ids vide' });
      const { data, error } = await db.from('Inscriptions')
        .select('id,prenom,nom,email,vague,heure_depart,categorie')
        .in('id', ids);
      if (error) return res.status(500).json({ error: error.message });
      const fiches = (data || []).filter(r => r.email && r.vague);
      const sansEmail = (data || []).filter(r => !r.email).map(r => `#${r.id} ${r.prenom} ${r.nom}`);

      if (b.test_to) {
        const n = await resendBatch(resendKey,
          [{ from: FROM, to: String(b.test_to).trim(), reply_to: REPLY_TO, ...mailVagueChange(fiches[0]) }],
          `hc3-vague-test-${Date.now()}`);
        return res.status(200).json({ test: true, envoyes: n, nb_destinataires_reels: fiches.length, exemple_fiche: fiches[0] });
      }
      if (b.envoyer !== true) {
        return res.status(200).json({
          dry_run: true, nombre: fiches.length, sans_email: sansEmail,
          destinataires: fiches.map(r => ({ id: r.id, nom: r.prenom + ' ' + r.nom, email: r.email, vague: r.vague, heure: heureLocale(r.heure_depart) })),
        });
      }
      let envoyes = 0;
      for (let i = 0; i < fiches.length; i += 100) {
        envoyes += await resendBatch(resendKey,
          fiches.slice(i, i + 100).map(r => ({ from: FROM, to: r.email, reply_to: REPLY_TO, ...mailVagueChange(r) })),
          `hc3-vague-${fiches.slice(i, i + 100).map(r => r.id).sort().join('-')}`);
      }
      return res.status(200).json({ envoye: true, nombre: fiches.length, envoyes, sans_email: sansEmail });
    }

    if (b.mode === 'categorie_change') {
      const id = Number(b.id);
      const ancienne = String(b.ancienne_categorie || '').trim();
      if (!id || !ancienne) return res.status(400).json({ error: 'id et ancienne_categorie requis' });
      const { data, error } = await db.from('Inscriptions')
        .select('id,prenom,nom,email,vague,heure_depart,categorie').eq('id', id).single();
      if (error) return res.status(500).json({ error: error.message });
      if (!data || !data.email) return res.status(404).json({ error: 'Fiche introuvable ou sans email' });

      if (b.test_to) {
        const n = await resendBatch(resendKey,
          [{ from: FROM, to: String(b.test_to).trim(), reply_to: REPLY_TO, ...mailCategorieChange(data, ancienne) }],
          `hc3-cat-test-${Date.now()}`);
        return res.status(200).json({ test: true, envoyes: n, fiche: data });
      }
      if (b.envoyer !== true) {
        return res.status(200).json({ dry_run: true, fiche: data, ancienne });
      }
      const n = await resendBatch(resendKey,
        [{ from: FROM, to: data.email, reply_to: REPLY_TO, ...mailCategorieChange(data, ancienne) }],
        `hc3-cat-${id}-v1`);
      return res.status(200).json({ envoye: true, envoyes: n, to: data.email });
    }

    return res.status(400).json({ error: 'mode manquant : vague_change ou categorie_change' });
  } catch (e) {
    console.error('hc3-notif', e);
    return res.status(500).json({ error: e.message });
  }
}
