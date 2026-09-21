import { createClient } from '@supabase/supabase-js';

// ============================================================================
// Mails aux familles pré-inscrites au cours Training Kids.
//
// Deux modes :
//
//  1. mode 'auto' (par défaut, sans mot de passe) — appelé par la page
//     kids-preinscription.html juste après l'enregistrement d'une nouvelle
//     pré-inscription. Envoie le mail de bienvenue (texte intemporel) à UNE
//     seule fiche, identifiée par son id.
//     Garde-fous : fiche Kids uniquement, email valide, créée il y a moins de
//     FENETRE_AUTO_MIN minutes, et jamais encore envoyée (marqueur dans
//     `niveau`, colonne inutilisée pour les fiches Kids).
//
//  2. mode 'lancement' (mot de passe JUGES_PASSWORD requis) — envoi manuel du
//     mail « c'est parti samedi 19 » à une liste EXPLICITE d'ids. Il n'y a
//     volontairement aucun mode « tous » : on envoie exactement aux ids
//     fournis, rien d'autre. `dry_run: true` liste les destinataires sans
//     rien envoyer.
// ============================================================================

const SUPABASE_URL = 'https://mzyfnmjzlosranptwucr.supabase.co';
const FROM = 'Training Kids — Crossfit La Buse <noreply@htclabuse.fr>';
const REPLY_TO = 'htclabuse@gmail.com';
const WHATSAPP = 'https://chat.whatsapp.com/GjaYPWaX5tK7QXMXfHZoBr?mode=gi_t';
const CATEGORIE_KIDS = 'Hyrox Kids Pré-inscription';
const FENETRE_AUTO_MIN = 15;
const MARQUEUR = 'mail_bienvenue_envoye';

function emailValide(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim()); }
function esc(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Âge et créneau selon la date de naissance de l'enfant.
function infosEnfant(dob) {
  let age = null;
  if (dob) {
    const [y, m, d] = dob.split('-').map(Number);
    const t = new Date();
    age = t.getFullYear() - y - ((t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) ? 1 : 0);
  }
  const grand = age !== null && age >= 10;
  return {
    age,
    groupe: grand ? '10-15 ans' : '5-9 ans',
    samedi: grand ? '9h30' : '8h45',
  };
}

function enveloppe(titre, corps) {
  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#fff;padding:2rem 1.5rem;border-radius:12px;">
  <div style="text-align:center;margin-bottom:1.5rem;">
    <div style="font-size:26px;font-weight:900;letter-spacing:2px;">TRAINING <span style="color:#A6D402;">KIDS</span></div>
    <div style="font-size:12px;color:#888;">Crossfit La Buse — Saint-Paul</div>
  </div>
  <h1 style="font-size:20px;color:#A6D402;margin:0 0 1rem;">${titre}</h1>
  <div style="font-size:15px;line-height:1.65;color:#eee;">${corps}</div>
  <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid #333;font-size:12px;color:#888;">
    L'équipe Training Kids — Crossfit La Buse<br>Une question ? Réponds à ce mail, écris-nous à <a href="mailto:htclabuse@gmail.com" style="color:#A6D402;">htclabuse@gmail.com</a> ou sur le groupe WhatsApp.
  </div>
</div>`;
}

// Mail « c'est parti samedi 19 » (mode lancement, texte validé par Stéphanie le 16/09/2026)
function mailLancement(r) {
  const parent = esc((r.prenom || '').trim()) || 'à vous';
  const enfant = esc((r.co1_prenom || '').trim()) || 'votre enfant';
  const i = infosEnfant(r.co1_date_naissance);
  const ageTxt = i.age !== null ? ` (${i.age} ans)` : '';
  const corps = `
<p>Salut ${parent},</p>
<p>Super nouvelle : les cours Training Kids démarrent <strong>ce samedi 19 septembre</strong> à Crossfit La Buse, et <strong>${enfant}</strong> est sur la liste ! 🙌</p>
<p>📅 <strong>Premier cours — samedi 19 septembre</strong><br>
&nbsp;&nbsp;• 5-9 ans : 8h45 à 9h30<br>
&nbsp;&nbsp;• 10-15 ans : 9h30 à 10h30<br>
&nbsp;&nbsp;👉 Pour ${enfant}${ageTxt}, c'est le créneau de <strong>${i.samedi}</strong>.</p>
<p>Cette première séance est une <strong>séance d'essai, gratuite et sans engagement</strong> : on bouge, on rigole, on découvre — et on voit si ça lui plaît (spoiler : oui 😄).</p>
<p><strong>Petite chose à faire : dis-nous si ${enfant} sera là samedi !</strong> Réponds simplement à ce mail, ou viens le dire directement sur le groupe WhatsApp des parents :<br>
<a href="${WHATSAPP}" style="color:#A6D402;font-weight:700;">Rejoindre le groupe WhatsApp</a></p>
<p>💡 <strong>Les formules :</strong><br>
&nbsp;&nbsp;• Abonnement : <strong>30 €/mois</strong> — le samedi matin<br>
&nbsp;&nbsp;• Fratrie : <strong>30 €/mois par enfant</strong><br>
&nbsp;&nbsp;• Sans abonnement : carnet de <strong>10 séances pour 120 €</strong><br>
On en parle sur place !</p>
<p>À prévoir : une tenue de sport, des baskets et une gourde. On s'occupe du reste 💪</p>
<p>À samedi !</p>`;
  return { subject: "🎉 Training Kids : c'est parti samedi 19 !", html: enveloppe("C'est parti samedi 19 !", corps) };
}

// Mail de bienvenue intemporel (mode auto, envoyé à chaque nouvelle pré-inscription)
function mailBienvenue(r) {
  const parent = esc((r.prenom || '').trim()) || 'à vous';
  const enfant = esc((r.co1_prenom || '').trim()) || 'votre enfant';
  const i = infosEnfant(r.co1_date_naissance);
  const ageTxt = i.age !== null ? ` (${i.age} ans)` : '';
  // Depuis le 21/09/2026 : uniquement le samedi matin (plus de mercredi), 30 €/mois
  const lignesJours = `&nbsp;&nbsp;• Samedi matin à <strong>${i.samedi}</strong><br>`;
  const formuleTxt = '';
  const corps = `
<p>Salut ${parent},</p>
<p>La pré-inscription de <strong>${enfant}</strong> au Training Kids est bien reçue — bienvenue dans l'équipe ! 🙌</p>
<p>📅 <strong>Les cours de ${enfant}${ageTxt} — groupe ${i.groupe}</strong><br>
${lignesJours}
&nbsp;&nbsp;à Crossfit La Buse, Saint-Paul. ${enfant} vient quand il/elle peut, sans obligation de présence.</p>
${formuleTxt}
<p>La <strong>première séance est offerte</strong>, sans engagement : on bouge, on rigole, on découvre — et on voit si ça lui plaît (spoiler : oui 😄).</p>
<p><strong>Petite chose à faire : dis-nous à quelle séance ${enfant} vient pour son essai !</strong> Réponds simplement à ce mail, ou viens le dire directement sur le groupe WhatsApp des parents :<br>
<a href="${WHATSAPP}" style="color:#A6D402;font-weight:700;">Rejoindre le groupe WhatsApp</a></p>
<p>💡 <strong>Les formules :</strong><br>
&nbsp;&nbsp;• Abonnement : <strong>30 €/mois</strong> — le samedi matin<br>
&nbsp;&nbsp;• Fratrie : <strong>30 €/mois par enfant</strong><br>
&nbsp;&nbsp;• Sans abonnement : carnet de <strong>10 séances pour 120 €</strong><br>
On en parle sur place !</p>
<p>À prévoir : une tenue de sport, des baskets et une gourde. On s'occupe du reste 💪</p>
<p>À très vite !</p>`;
  return { subject: `🎉 ${enfant} est pré-inscrit(e) au Training Kids !`, html: enveloppe('Bienvenue dans l\'équipe !', corps) };
}

async function envoyer(resendKey, to, { subject, html }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html, reply_to: REPLY_TO }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error('Resend ' + resp.status + ' : ' + JSON.stringify(data));
  return data.id || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const resendKey = process.env.RESEND_API_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!resendKey || !serviceKey) return res.status(500).json({ error: 'Configuration serveur incomplète' });
  const db = createClient(SUPABASE_URL, serviceKey);

  const body = req.body || {};
  const mode = body.mode === 'lancement' ? 'lancement' : 'auto';

  try {
    // ------------------------------------------------------------ mode auto
    if (mode === 'auto') {
      const id = parseInt(body.id, 10);
      if (!id) return res.status(400).json({ error: 'id requis' });

      const { data: r, error } = await db.from('Inscriptions').select('*').eq('id', id).single();
      if (error || !r) return res.status(404).json({ error: 'Fiche introuvable' });
      if (r.categorie !== CATEGORIE_KIDS) return res.status(400).json({ error: 'Pas une pré-inscription Kids' });
      if (!emailValide(r.email)) return res.status(400).json({ error: 'Email invalide' });
      if (String(r.niveau || '').startsWith(MARQUEUR)) return res.status(200).json({ success: true, skipped: 'déjà envoyé' });
      const ageMin = (Date.now() - new Date(r.created_at).getTime()) / 60000;
      if (ageMin > FENETRE_AUTO_MIN) return res.status(400).json({ error: 'Fiche trop ancienne pour un envoi automatique' });

      const resendId = await envoyer(resendKey, r.email.trim(), mailBienvenue(r));
      await db.from('Inscriptions').update({ niveau: MARQUEUR + ':' + new Date().toISOString() }).eq('id', id);
      return res.status(200).json({ success: true, id, sent_to: r.email.trim(), resend_id: resendId });
    }

    // ------------------------------------------------------- mode lancement
    if (!body.password || body.password !== process.env.JUGES_PASSWORD) {
      return res.status(401).json({ error: 'Non autorisé' });
    }
    const ids = Array.isArray(body.ids) ? body.ids.map(n => parseInt(n, 10)).filter(Boolean) : [];
    if (ids.length === 0) return res.status(400).json({ error: 'ids requis (liste explicite, non vide)' });
    const dryRun = body.dry_run === true || body.dry_run === 1 || body.dry_run === '1';

    const { data: rows, error } = await db.from('Inscriptions').select('*').in('id', ids).eq('categorie', CATEGORIE_KIDS);
    if (error) return res.status(500).json({ error: error.message });

    const resultats = [];
    for (const r of rows) {
      const to = String(r.email || '').trim();
      const m = mailLancement(r);
      if (!emailValide(to)) { resultats.push({ id: r.id, skipped: 'email invalide' }); continue; }
      if (dryRun) { resultats.push({ id: r.id, to, enfant: r.co1_prenom, subject: m.subject, dry_run: true }); continue; }
      try {
        const resendId = await envoyer(resendKey, to, m);
        resultats.push({ id: r.id, to, sent: true, resend_id: resendId });
      } catch (e) {
        resultats.push({ id: r.id, to, sent: false, error: e.message });
      }
    }
    const manquants = ids.filter(i => !rows.some(r => r.id === i));
    return res.status(200).json({
      success: true, mode: 'lancement', dry_run: dryRun,
      demandes: ids.length, trouves: rows.length, envoyes: resultats.filter(x => x.sent).length,
      ids_introuvables_ou_non_kids: manquants, resultats,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
