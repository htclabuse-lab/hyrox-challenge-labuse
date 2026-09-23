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
//
//  3. mode 'ouverture' (mot de passe JUGES_PASSWORD requis) — même principe que
//     'lancement' (ids explicites, dry_run) mais UN mail par email de parent
//     (une fratrie = un seul mail listant les enfants) : ouverture des
//     inscriptions payantes, pas de mercredi pour l'instant, groupes et règles.
//
//  4. mode 'travaux' (mot de passe JUGES_PASSWORD requis) — même mécanique :
//     salle en travaux, pas de cours d'ici fin septembre, reprise le samedi
//     3 octobre, et rien n'est prélevé pour septembre.
// ============================================================================

const SUPABASE_URL = 'https://mzyfnmjzlosranptwucr.supabase.co';
const FROM = 'Training Kids — Crossfit La Buse <noreply@htclabuse.fr>';
const REPLY_TO = 'htclabuse@gmail.com';
const WHATSAPP = 'https://chat.whatsapp.com/GjaYPWaX5tK7QXMXfHZoBr?mode=gi_t';
const PAGE_INSCRIPTION = 'https://hyrox-challenge-labuse.vercel.app/kids-inscription.html';
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
  const grand = age !== null && age >= 9;
  return {
    age,
    groupe: grand ? 'Groupe 2' : 'Groupe 1',
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
&nbsp;&nbsp;• Groupe 1 : 8h45 à 9h30<br>
&nbsp;&nbsp;• Groupe 2 : 9h30 à 10h30<br>
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
<p>📅 <strong>Les cours de ${enfant}${ageTxt} — ${i.groupe}</strong><br>
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

// Mail « ouverture des inscriptions » (mode ouverture, texte validé par Stéphanie le 22/09/2026).
// `rows` = toutes les fiches d'un même parent (fratrie possible) : un seul mail pour la famille.
function mailOuverture(rows) {
  const r0 = rows[0];
  const parent = esc((r0.prenom || '').trim()) || 'à vous';
  const enfants = rows.map(r => {
    const i = infosEnfant(r.co1_date_naissance);
    // Groupe 2 dès 9 ans ; le coach peut avoir placé l'enfant ailleurs (colonne `groupe`).
    const auto = (i.age !== null && i.age >= 9) ? 'grands' : 'petits';
    const g = (r.groupe === 'petits' || r.groupe === 'grands') ? r.groupe : auto;
    return {
      nom: esc((r.co1_prenom || '').trim()) || 'votre enfant',
      age: i.age,
      groupe: g,
      label: g === 'grands' ? 'Groupe 2' : 'Groupe 1',
      heure: g === 'grands' ? '9h30' : '8h45',
      // Monté chez les grands alors que son âge ne l'imposait pas : on lui explique.
      monte: g === 'grands' && auto === 'petits',
    };
  });
  const lignesEnfants = enfants.map(e =>
    `&nbsp;&nbsp;👉 <strong>${e.nom}</strong>${e.age !== null ? ` (${e.age} ans)` : ''} est dans le <strong>${e.label}</strong>, de <strong>${e.heure}</strong>.<br>`
  ).join('\n');
  const montes = enfants.filter(e => e.monte);
  const blocMonte = montes.length
    ? `<p style="background:#141400;border-left:3px solid #A6D402;padding:10px 12px;margin:1rem 0;"><strong>Changement de créneau :</strong> ${montes.map(e => e.nom).join(' et ')} ${montes.length > 1 ? 'passent' : 'passe'} dans le groupe suivant, à <strong>9h30</strong>. Le coach préfère ${montes.length > 1 ? 'qu\'ils s\'entraînent' : `que ${montes[0].nom} s\'entraîne`} avec les plus grands, c'est mieux adapté à ${montes.length > 1 ? 'leur' : 'son'} niveau.</p>`
    : '';
  const listeNoms = enfants.map(e => e.nom).join(' et ');
  const corps = `
<p>Salut ${parent},</p>
<p>Merci pour ces premières séances d'essai, les enfants ont bien bougé 💪<br>Voici tout ce qu'il faut savoir pour la suite.</p>

<p><strong>📅 Pour le moment, les cours ont lieu uniquement le samedi matin</strong></p>
<p>Le créneau du mercredi après-midi <strong>n'ouvre pas pour l'instant</strong> : pas assez d'enfants dessus pour le lancer. Si ça évolue dans l'année, on vous préviendra en premier.</p>
<p>Rendez-vous donc le samedi, à Crossfit La Buse :<br>
&nbsp;&nbsp;• Groupe 1 — les plus jeunes : <strong>8h45 à 9h30</strong><br>
&nbsp;&nbsp;• Groupe 2 — les plus grands : <strong>9h30 à 10h30</strong><br>
${lignesEnfants}</p>
<p style="font-size:13px;color:#aaa;">Les groupes sont faits par le coach selon l'âge et le niveau de chacun.</p>
${blocMonte}

<p><strong>📝 Comment inscrire ${listeNoms}</strong></p>
<p>L'inscription se fait <strong>uniquement en ligne</strong>, sur cette page :<br>
<a href="${PAGE_INSCRIPTION}" style="display:inline-block;background:#A6D402;color:#0a0a0a;font-weight:800;padding:12px 20px;border-radius:8px;text-decoration:none;margin:8px 0;">👉 Inscrire mon enfant</a><br>
<span style="font-size:12px;color:#888;">Si le bouton ne marche pas, copie cette adresse dans ton navigateur :<br><a href="${PAGE_INSCRIPTION}" style="color:#A6D402;">${PAGE_INSCRIPTION}</a></span></p>
<p>Tu y remplis les infos de l'enfant et du parent, tu attestes qu'il peut pratiquer une activité sportive, et tu mets en place le paiement. C'est tout, ça prend 3 minutes.</p>
<p>⚠️ <strong>Sans inscription en ligne, l'enfant ne pourra pas être accepté au cours</strong>, même s'il est déjà venu à l'essai. On sait que c'est strict, mais c'est la seule façon de savoir qui est là, de respecter les 12 places par groupe et d'être assurés correctement.</p>

<p><strong>⚠️ 12 places par groupe</strong></p>
<p>Ce sont les <strong>12 premiers inscrits</strong> de chaque groupe qui ont leur place. Au-delà, l'inscription bascule automatiquement en <strong>liste d'attente</strong> (rien n'est payé) et on te rappelle dès qu'une place se libère dans l'année.</p>

<p><strong>💰 Le tarif</strong><br>
&nbsp;&nbsp;• <strong>30 €/mois</strong>, prélevés automatiquement le 1er de chaque mois<br>
&nbsp;&nbsp;• <strong>Sans engagement de durée.</strong> Pour arrêter : un simple mail à <a href="mailto:${REPLY_TO}" style="color:#A6D402;">${REPLY_TO}</a> <strong>avant le 25 du mois</strong>, et le mois suivant n'est pas prélevé<br>
&nbsp;&nbsp;• Le premier mois est calculé au prorata des jours restants<br>
&nbsp;&nbsp;• Sans abonnement : carnet de 10 séances pour 120 €, à voir sur place</p>

<p>À prévoir chaque samedi : une tenue de sport, des baskets et une gourde.</p>
<p>Une question ? Réponds à ce mail, ou viens sur le groupe WhatsApp des parents :<br>
<a href="${WHATSAPP}" style="color:#A6D402;font-weight:700;">Rejoindre le groupe WhatsApp</a></p>
<p>À samedi !</p>`;
  return { subject: 'Training Kids — les inscriptions sont ouvertes', html: enveloppe('Les inscriptions sont ouvertes', corps) };
}

// Mail « salle en travaux, reprise le 3 octobre » (mode travaux, validé par Stéphanie le 23/09/2026).
function mailTravaux(rows) {
  const r0 = rows[0];
  const parent = esc((r0.prenom || '').trim()) || 'à vous';
  const enfants = rows.map(r => esc((r.co1_prenom || '').trim()) || 'votre enfant');
  const listeNoms = enfants.join(' et ');
  const plusieurs = enfants.length > 1;
  const corps = `
<p>Salut ${parent},</p>
<p>Petit contretemps : <strong>la salle est en travaux</strong>, il n'y aura donc <strong>pas de cours d'ici la fin du mois</strong>. Les Training Kids reprennent le <strong>samedi 3 octobre</strong>, aux horaires habituels.</p>
<p><strong>Rien n'est prélevé pour septembre</strong> — pas un centime. Si tu inscris ${listeNoms} dès maintenant, tu enregistres simplement ta carte et le premier prélèvement de 30 € aura lieu le <strong>1er octobre</strong>, quand les cours reprennent.</p>
<p>Tu peux donc ${plusieurs ? 'les' : 'l\''}inscrire tranquillement dès aujourd'hui, ça réserve ${plusieurs ? 'leurs places' : 'sa place'} :<br>
<a href="${PAGE_INSCRIPTION}" style="display:inline-block;background:#A6D402;color:#0a0a0a;font-weight:800;padding:12px 20px;border-radius:8px;text-decoration:none;margin:8px 0;">👉 Inscrire mon enfant</a><br>
<span style="font-size:12px;color:#888;">Si le bouton ne marche pas, copie cette adresse dans ton navigateur :<br><a href="${PAGE_INSCRIPTION}" style="color:#A6D402;">${PAGE_INSCRIPTION}</a></span></p>
<p>Désolés pour ce décalage, on a hâte de ${plusieurs ? 'les' : 'le/la'} retrouver le 3 octobre 💪</p>`;
  return { subject: 'Training Kids — reprise le samedi 3 octobre', html: enveloppe('Reprise le samedi 3 octobre', corps) };
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
  const mode = body.mode === 'lancement' ? 'lancement' : body.mode === 'ouverture' ? 'ouverture' : body.mode === 'travaux' ? 'travaux' : 'auto';

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

    // -------------------------------------- modes manuels (lancement, ouverture)
    if (!body.password || body.password !== process.env.JUGES_PASSWORD) {
      return res.status(401).json({ error: 'Non autorisé' });
    }
    const ids = Array.isArray(body.ids) ? body.ids.map(n => parseInt(n, 10)).filter(Boolean) : [];
    if (ids.length === 0) return res.status(400).json({ error: 'ids requis (liste explicite, non vide)' });
    const dryRun = body.dry_run === true || body.dry_run === 1 || body.dry_run === '1';

    const { data: rows, error } = await db.from('Inscriptions').select('*').in('id', ids).eq('categorie', CATEGORIE_KIDS);
    if (error) return res.status(500).json({ error: error.message });

    const resultats = [];
    if (mode === 'ouverture' || mode === 'travaux') {
      // Un mail par parent : regroupe les fiches par email (fratrie)
      const parEmail = new Map();
      for (const r of rows) {
        const to = String(r.email || '').trim().toLowerCase();
        if (!parEmail.has(to)) parEmail.set(to, []);
        parEmail.get(to).push(r);
      }
      let premier = true;
      for (const [to, grp] of parEmail) {
        // Resend limite à 10 envois/seconde : on espace de 150 ms (constaté le 22/09/2026).
        if (!dryRun && !premier) await new Promise(r => setTimeout(r, 150));
        premier = false;
        const m = mode === 'travaux' ? mailTravaux(grp) : mailOuverture(grp);
        const ids = grp.map(r => r.id), enfants = grp.map(r => r.co1_prenom);
        if (!emailValide(to)) { resultats.push({ ids, skipped: 'email invalide' }); continue; }
        if (dryRun) { resultats.push({ ids, to, enfants, subject: m.subject, dry_run: true }); continue; }
        try {
          const resendId = await envoyer(resendKey, to, m);
          resultats.push({ ids, to, enfants, sent: true, resend_id: resendId });
        } catch (e) {
          resultats.push({ ids, to, enfants, sent: false, error: e.message });
        }
      }
    }
    for (const r of (mode === 'lancement' ? rows : [])) {
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
      success: true, mode, dry_run: dryRun,
      demandes: ids.length, trouves: rows.length, envoyes: resultats.filter(x => x.sent).length,
      ids_introuvables_ou_non_kids: manquants, resultats,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
