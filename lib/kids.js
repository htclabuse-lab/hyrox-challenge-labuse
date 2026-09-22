// ============================================================================
// Cours Training Kids — constantes et helpers partagés entre
// api/kids-checkout.js, api/kids-webhook.js (et à terme api/kids-bienvenue.js).
// ============================================================================

export const SUPABASE_URL = 'https://mzyfnmjzlosranptwucr.supabase.co';
export const FROM = 'Training Kids — Crossfit La Buse <noreply@htclabuse.fr>';
export const REPLY_TO = 'htclabuse@gmail.com';
export const WHATSAPP = 'https://chat.whatsapp.com/GjaYPWaX5tK7QXMXfHZoBr?mode=gi_t';

export const CATEGORIE_PREINSCRIPTION = 'Hyrox Kids Pré-inscription';
export const CATEGORIE_INSCRIPTION = 'Hyrox Kids Inscription';

export const PRIX_MENSUEL = 30;          // € / mois, prélevé le 1er
export const PLACES_PAR_GROUPE = 12;

// Deux groupes le samedi matin. La clé est stockée dans la colonne `groupe`.
export const GROUPES = {
  petits: { label: '5-9 ans', heure: '8h45', horaire: '8h45 à 9h30' },
  grands: { label: '10-15 ans', heure: '9h30', horaire: '9h30 à 10h30' },
};

export function emailValide(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim()); }
export function esc(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Âge révolu à partir de la date de naissance (YYYY-MM-DD).
export function ageDe(dob) {
  if (!dob) return null;
  const [y, m, d] = String(dob).split('-').map(Number);
  if (!y || !m || !d) return null;
  const t = new Date();
  return t.getFullYear() - y - ((t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) ? 1 : 0);
}

// Groupe par défaut selon l'âge. Le coach peut ensuite changer `groupe` dans l'admin.
export function groupeParAge(dob) {
  const age = ageDe(dob);
  return age !== null && age >= 10 ? 'grands' : 'petits';
}

export function enveloppe(titre, corps) {
  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#fff;padding:2rem 1.5rem;border-radius:12px;">
  <div style="text-align:center;margin-bottom:1.5rem;">
    <div style="font-size:26px;font-weight:900;letter-spacing:2px;">TRAINING <span style="color:#A6D402;">KIDS</span></div>
    <div style="font-size:12px;color:#888;">Crossfit La Buse — Saint-Paul</div>
  </div>
  <h1 style="font-size:20px;color:#A6D402;margin:0 0 1rem;">${titre}</h1>
  <div style="font-size:15px;line-height:1.65;color:#eee;">${corps}</div>
  <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid #333;font-size:12px;color:#888;">
    L'équipe Training Kids — Crossfit La Buse<br>Une question ? Réponds à ce mail, écris-nous à <a href="mailto:${REPLY_TO}" style="color:#A6D402;">${REPLY_TO}</a> ou sur le groupe WhatsApp.
  </div>
</div>`;
}

// Mail envoyé par le webhook quand l'abonnement est en place : la place est confirmée.
export function mailConfirmation(r) {
  const parent = esc((r.prenom || '').trim()) || 'à vous';
  const enfant = esc((r.co1_prenom || '').trim()) || 'votre enfant';
  const g = GROUPES[r.groupe] || GROUPES.petits;
  const corps = `
<p>Salut ${parent},</p>
<p>C'est bon : <strong>la place de ${enfant} est confirmée</strong> au Training Kids ! 🙌</p>
<p>📅 <strong>Tous les samedis matin</strong> à Crossfit La Buse, Saint-Paul<br>
&nbsp;&nbsp;👉 Groupe <strong>${g.label}</strong> : <strong>${g.horaire}</strong></p>
<p>💳 Abonnement de <strong>${PRIX_MENSUEL} €/mois</strong>, prélevé le 1er de chaque mois, sans engagement de durée. Pour arrêter : un mail à <a href="mailto:${REPLY_TO}" style="color:#A6D402;">${REPLY_TO}</a> <strong>avant le 25 du mois</strong>, et le mois suivant n'est pas prélevé.</p>
<p>À prévoir chaque samedi : une tenue de sport, des baskets et une gourde. On s'occupe du reste 💪</p>
<p>Pour les infos de dernière minute, rejoins le groupe WhatsApp des parents :<br>
<a href="${WHATSAPP}" style="color:#A6D402;font-weight:700;">Rejoindre le groupe WhatsApp</a></p>
<p>À samedi !</p>`;
  return { subject: `✅ La place de ${enfant} au Training Kids est confirmée`, html: enveloppe('Place confirmée !', corps) };
}

// Mail envoyé par kids-checkout quand le groupe est plein : liste d'attente, rien à payer.
export function mailListeAttente(r, position) {
  const parent = esc((r.prenom || '').trim()) || 'à vous';
  const enfant = esc((r.co1_prenom || '').trim()) || 'votre enfant';
  const g = GROUPES[r.groupe] || GROUPES.petits;
  const corps = `
<p>Salut ${parent},</p>
<p>Le groupe <strong>${g.label}</strong> du samedi est <strong>complet</strong> pour le moment (${PLACES_PAR_GROUPE} enfants maximum).</p>
<p><strong>${enfant} est sur liste d'attente</strong>${position ? ` en position <strong>${position}</strong>` : ''}. Rien n'a été payé. Dès qu'une place se libère dans l'année, on te recontacte par mail ou téléphone pour finaliser l'inscription.</p>
<p>Merci pour ta patience 🙏</p>`;
  return { subject: `⏳ ${enfant} est sur liste d'attente au Training Kids`, html: enveloppe("Liste d'attente", corps) };
}

export async function envoyerMail(resendKey, to, { subject, html }) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html, reply_to: REPLY_TO }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error('Resend ' + resp.status + ' : ' + (json.message || JSON.stringify(json)));
  return json.id;
}

// Nombre de places prises et libres par groupe (seules les fiches payées comptent).
export async function placesParGroupe(db) {
  const { data, error } = await db.from('Inscriptions')
    .select('groupe')
    .eq('categorie', CATEGORIE_INSCRIPTION)
    .eq('statut_paiement', 'payé');
  if (error) throw new Error(error.message);
  const out = {};
  for (const k of Object.keys(GROUPES)) {
    const pris = (data || []).filter(r => r.groupe === k).length;
    out[k] = { pris, libres: Math.max(0, PLACES_PAR_GROUPE - pris), max: PLACES_PAR_GROUPE };
  }
  return out;
}
