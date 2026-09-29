// ============================================================================
// Hyrox Parents / Enfants — 2e édition (samedi 14 novembre 2026).
// Constantes et helpers partagés entre api/pe-checkout.js et api/kids-webhook.js.
//
// Les fiches vont dans la table `Inscriptions`, catégorie « Parent-Enfant »
// (comme la 1re édition) : elles sont donc déjà exclues des pages HC (vagues,
// juges, live, compteurs). On distingue la 2e édition par sa date de création
// (>= EDITION_2_DEPUIS). Le format est stocké dans `niveau`, comme en juin.
//
// Paiement : compte Stripe « Hyrox Training Club La Buse » (clé STRIPE_KIDS_*),
// le même que les cours Kids. Le webhook api/kids-webhook.js reconnaît ces
// paiements grâce à metadata.type = TYPE_STRIPE.
// ============================================================================

import { esc } from './kids.js';

export const CATEGORIE = 'Parent-Enfant';
export const EDITION_2_DEPUIS = '2026-09-01';
export const TYPE_STRIPE = 'parent-enfant-2';
export const PRIX = 68;                    // € par binôme, avant code promo
export const DATE_EVENT = '2026-11-14';    // sert au calcul de l'âge de l'enfant
export const DATE_LABEL = 'samedi 14 novembre 2026';
export const AGE_MIN = 5;
export const AGE_MAX = 15;
export const FORMATS = {
  standard: { label: 'Standard — 200 m', court: 'Standard (200 m de course entre chaque station)' },
  xl:       { label: 'XL — 400 m',       court: 'XL (400 m de course entre chaque station)' },
};

export const FROM = 'Hyrox Parents / Enfants La Buse <noreply@htclabuse.fr>';
export const REPLY_TO = 'htclabuse@gmail.com';

// Âge de l'enfant le jour de l'épreuve (YYYY-MM-DD).
export function ageLeJour(dob) {
  const [y, m, d] = String(dob || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  const [ey, em, ed] = DATE_EVENT.split('-').map(Number);
  return ey - y - ((em < m || (em === m && ed < d)) ? 1 : 0);
}

// Mail envoyé par le webhook quand le paiement est passé.
export function mailConfirmation(r, montantPaye) {
  const parent = esc((r.prenom || '').trim()) || 'à vous';
  const enfant = esc((r.co1_prenom || '').trim()) || 'votre enfant';
  const prix = typeof montantPaye === 'number' ? montantPaye.toFixed(2).replace('.', ',').replace(',00', '') + ' €' : null;
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#fff;padding:2rem 1.5rem;border-radius:12px;">
  <div style="text-align:center;margin-bottom:1.5rem;">
    <div style="font-size:24px;font-weight:900;letter-spacing:2px;">HYROX <span style="color:#FFEE00;">PARENTS / ENFANTS</span></div>
    <div style="font-size:12px;color:#888;">2e édition — Crossfit La Buse, Saint-Paul</div>
  </div>
  <h1 style="font-size:20px;color:#FFEE00;margin:0 0 1rem;">Inscription confirmée ! 🎉</h1>
  <div style="font-size:15px;line-height:1.65;color:#eee;">
    <p>Salut ${parent},</p>
    <p>C'est bon : <strong>ton binôme avec ${enfant} est inscrit</strong> au Hyrox Parents / Enfants.</p>
    <p>📅 <strong>${DATE_LABEL}</strong> — Crossfit La Buse, Saint-Paul<br>
    ⏰ L'horaire de passage vous sera communiqué plus tard par mail.<br>
    🏃 Format : <strong>${esc((FORMATS[r._format] || {}).court || r.niveau || '')}</strong></p>
    <p>👕 T-shirts : parent <strong>${esc([r.tshirt_taille, r.tshirt_coupe].filter(Boolean).join(' ') || '—')}</strong> · enfant <strong>${esc(r.co1_tshirt || '—')}</strong></p>
    ${prix ? `<p>💳 Montant réglé : <strong>${prix}</strong></p>` : ''}
    <p>À prévoir : une tenue de sport, des baskets et une gourde pour chacun.</p>
    <p>Toutes les infos sont sur le site : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil" style="color:#FFEE00;font-weight:700;">hyrox-challenge-labuse.vercel.app</a></p>
    <p>À très vite !</p>
  </div>
  <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid #333;font-size:12px;color:#888;">
    L'équipe Hyrox Challenge La Buse<br>Une question ? Réponds à ce mail ou écris-nous à <a href="mailto:${REPLY_TO}" style="color:#FFEE00;">${REPLY_TO}</a>.
  </div>
</div>`;
  return { subject: `✅ Inscription confirmée — Hyrox Parents / Enfants du ${DATE_LABEL.replace('samedi ', '')}`, html };
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

// Traite un checkout.session.completed du compte Training Club portant
// metadata.type = TYPE_STRIPE. Appelé par api/kids-webhook.js.
export async function traiterPaiement(db, session, resendKey) {
  const id = parseInt(session.client_reference_id || session.metadata?.inscription_id, 10);
  if (!id) return { ignored: 'pas d\'inscription_id' };
  const { data: r } = await db.from('Inscriptions').select('*').eq('id', id).eq('categorie', CATEGORIE).single();
  if (!r) return { ignored: 'fiche introuvable ' + id };
  const dejaPaye = r.statut_paiement === 'paye';
  const montant = (session.amount_total || 0) / 100;

  // Le prix réel (après code promo éventuel) remplace les 68 € affichés.
  await db.from('Inscriptions').update({ statut_paiement: 'paye', prix: montant }).eq('id', id);

  if (!dejaPaye && resendKey && r.email) {
    const format = Object.keys(FORMATS).find(k => FORMATS[k].label === r.niveau);
    try { await envoyerMail(resendKey, r.email, mailConfirmation({ ...r, _format: format }, montant)); }
    catch (e) { console.error('Mail confirmation Parent-Enfant KO', e.message); }
  }
  return { id, statut: 'paye', montant };
}
