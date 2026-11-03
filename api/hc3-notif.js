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
//
// 3) VAGUES_CLOSED : mail générique à TOUS les inscrits HC #3 payés (hors PE).
//    « Vagues clôturées + rulebook à lire ». Dédoublonne par email (capitaine + co1/2/3).
//    POST { password, mode: 'vagues_closed', dry_run: true | test_to: 'x@y.fr' | envoyer: true }
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

function mailBenevolesRulebook(prenom) {
  const salut = prenom ? `Salut <strong>${prenom}</strong>,` : 'Salut à toi,';
  return {
    subject: '🙌 HC #3 — merci d\'être bénévole ! Lis le rulebook pour tout comprendre',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + `<p>${salut}</p>`
      + '<p>Merci encore d\'avoir répondu présent·e pour nous aider sur le <strong>Hyrox Challenge La Buse #3</strong> ce dimanche 15 novembre 2026 ! 💛🖤</p>'
      + '<p>Pour que tu sois à l\'aise sur ton poste, il est <strong>important que tu lises le rulebook de la course</strong> : tu y trouveras les règles de chaque station, les pénalités, les standards de mouvement et le fonctionnement général de l\'événement. Ça te permettra de bien comprendre ce que font les athlètes et de répondre à leurs questions.</p>'
      + '<p>👉 <a href="https://hyrox-challenge-labuse.vercel.app/rulebook.html">https://hyrox-challenge-labuse.vercel.app/rulebook.html</a></p>'
      + '<p>On t\'enverra bientôt les derniers détails logistiques (lieu de rendez-vous, horaires exacts selon ta dispo).</p>'
      + '<p>À très vite ! 🫶</p>'
      + '<p><strong>Stéphanie &amp; l\'équipe La Buse</strong></p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailVaguesClosed(prenom) {
  const salut = prenom ? `Salut <strong>${prenom}</strong>,` : 'Salut à toi,';
  return {
    subject: '🏁 Hyrox Challenge La Buse #3 — vagues clôturées + rulebook (impératif)',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + `<p>${salut}</p>`
      + '<p>Plus que quelques jours avant le <strong>Hyrox Challenge La Buse #3</strong> (dimanche 15 novembre 2026) !</p>'
      + '<p><strong>⚠️ Les vagues sont désormais clôturées et finalisées.</strong> Plus aucun changement d\'horaire ne sera possible d\'ici dimanche. Vérifie une dernière fois ta <strong>vague et ton heure de départ</strong> (onglet « À venir » → section Vagues, recherche par nom ou équipe) :<br>👉 <a href="https://hyrox-challenge-labuse.vercel.app/#vagues">https://hyrox-challenge-labuse.vercel.app/#vagues</a></p>'
      + '<p><strong>📘 LIRE LE RULEBOOK EST IMPÉRATIF.</strong> Règles du format, standards de mouvement, logistique, zones, horaires — tout y est. Prends 10 minutes, c\'est le meilleur investissement avant la course :<br>👉 <a href="https://hyrox-challenge-labuse.vercel.app/rulebook.html">https://hyrox-challenge-labuse.vercel.app/rulebook.html</a></p>'
      + '<p>On a hâte de te voir dimanche. En attendant : repos, hydratation, et pas de PR la veille 😉</p>'
      + '<p><strong>Stéphanie &amp; l\'équipe La Buse</strong> 💛🖤</p>'
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

    if (b.mode === 'vagues_closed') {
      // Mail générique à TOUS les inscrits HC #3 payés (15/11, hors PE).
      // Flatten capitaine + co1/2/3 → dédoublonne par email.
      const { data, error } = await db.from('Inscriptions')
        .select('id,prenom,nom,email,co1_prenom,co1_nom,co1_email,co2_prenom,co2_nom,co3_prenom,co3_nom,categorie,heure_depart,statut_paiement')
        .gte('heure_depart', '2026-11-15').lt('heure_depart', '2026-11-16')
        .neq('categorie', 'Parent-Enfant')
        .eq('statut_paiement', 'paye');
      if (error) return res.status(500).json({ error: error.message });
      const EXCLUS = ['stephanie.caro31@gmail.com'];
      const parEmail = {};
      (data || []).forEach(ins => {
        const push = (prenom, email) => {
          const e = String(email || '').trim().toLowerCase();
          if (!e || EXCLUS.includes(e)) return;
          (parEmail[e] = parEmail[e] || []).push((prenom || '').trim());
        };
        push(ins.prenom, ins.email);
        push(ins.co1_prenom, ins.co1_email);
        // Pas de co2_email / co3_email en DB : les coéquipiers 2 et 3 ne reçoivent pas directement.
      });
      const emails = Object.keys(parEmail).sort();
      const prenomDe = e => {
        const prenoms = [...new Set(parEmail[e].filter(Boolean))];
        return prenoms.length === 1 ? prenoms[0] : null;
      };

      if (b.test_to) {
        const n = await resendBatch(resendKey,
          [{ from: FROM, to: String(b.test_to).trim(), reply_to: REPLY_TO, ...mailVaguesClosed('Stéphanie (APERÇU)') }],
          `hc3-vagues-closed-test-${Date.now()}`);
        return res.status(200).json({ test: true, envoyes: n, nb_destinataires_reels: emails.length });
      }
      if (b.envoyer !== true) {
        return res.status(200).json({
          dry_run: true,
          nombre: emails.length,
          apercu_10_premiers: emails.slice(0, 10).map(e => ({ email: e, salut_avec: prenomDe(e) || '«Salut à toi»' })),
        });
      }
      let envoyes = 0;
      for (let i = 0; i < emails.length; i += 100) {
        envoyes += await resendBatch(resendKey,
          emails.slice(i, i + 100).map(to => ({ from: FROM, to, reply_to: REPLY_TO, ...mailVaguesClosed(prenomDe(to)) })),
          `hc3-vagues-closed-lot${i / 100}-v1`);
      }
      return res.status(200).json({ envoye: true, nombre: emails.length, envoyes });
    }

    if (b.mode === 'benevoles_rulebook') {
      // Mail aux bénévoles HC #3 (created_at >= 2026-09-01, même pivot que l'admin).
      // Exclut ceux qui sont uniquement sur la veille (= Parent-Enfant samedi, pas HC #3 dimanche).
      const { data, error } = await db.from('Benevoles')
        .select('id,prenom,email,disponibilites,created_at')
        .gte('created_at', '2026-09-01');
      if (error) return res.status(500).json({ error: error.message });
      const EXCLUS = ['stephanie.caro31@gmail.com'];
      const parEmail = {};
      (data || []).forEach(r => {
        if ((r.disponibilites || '').trim() === 'veille') return; // uniquement samedi PE : ignorer
        const e = String(r.email || '').trim().toLowerCase();
        if (!e || EXCLUS.includes(e)) return;
        (parEmail[e] = parEmail[e] || []).push((r.prenom || '').trim());
      });
      const emails = Object.keys(parEmail).sort();
      const prenomDe = e => {
        const prenoms = [...new Set(parEmail[e].filter(Boolean))];
        return prenoms.length === 1 ? prenoms[0] : null;
      };

      if (b.test_to) {
        const n = await resendBatch(resendKey,
          [{ from: FROM, to: String(b.test_to).trim(), reply_to: REPLY_TO, ...mailBenevolesRulebook('Stéphanie (APERÇU)') }],
          `hc3-benev-rb-test-${Date.now()}`);
        return res.status(200).json({ test: true, envoyes: n, nb_destinataires_reels: emails.length });
      }
      if (b.envoyer !== true) {
        return res.status(200).json({
          dry_run: true,
          nombre: emails.length,
          apercu_10_premiers: emails.slice(0, 10).map(e => ({ email: e, salut_avec: prenomDe(e) || '«Salut à toi»' })),
        });
      }
      let envoyes = 0;
      for (let i = 0; i < emails.length; i += 100) {
        envoyes += await resendBatch(resendKey,
          emails.slice(i, i + 100).map(to => ({ from: FROM, to, reply_to: REPLY_TO, ...mailBenevolesRulebook(prenomDe(to)) })),
          `hc3-benev-rb-lot${i / 100}-v1`);
      }
      return res.status(200).json({ envoye: true, nombre: emails.length, envoyes });
    }

    return res.status(400).json({ error: 'mode manquant : vague_change, categorie_change, vagues_closed ou benevoles_rulebook' });
  } catch (e) {
    console.error('hc3-notif', e);
    return res.status(500).json({ error: e.message });
  }
}
