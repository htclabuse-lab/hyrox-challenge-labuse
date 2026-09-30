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
export const PRIX_PACK_PHOTO = 20;         // € par binôme, jamais réduit par les codes promo
export const TYPE_STRIPE_PACK = 'parent-enfant-2-pack'; // pack photo ajouté après l'inscription
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

// Images du mail : servies par le site en production (URL publique obligatoire
// pour les messageries). logo-parent-enfant.jpg = logo Parent / Enfant (sled).
const SITE = 'https://hyrox-challenge-labuse.vercel.app';
const COULEURS = ['#ff3399', '#FFA726', '#FFEE00', '#a3e635', '#00d8ff'];

// Bande multicolore façon « éclaboussures » de l'affiche (tableau : compatible Gmail/Outlook).
function bande(h = 6) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>${
    COULEURS.map(c => `<td style="background:${c};height:${h}px;font-size:0;line-height:0;">&nbsp;</td>`).join('')}</tr></table>`;
}

// Une ligne d'info avec pastille de couleur à gauche.
function ligne(couleur, icone, titre, valeur) {
  return `<tr><td style="padding:0 0 10px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#161616;border-radius:10px;border-left:5px solid ${couleur};">
      <tr><td style="padding:12px 14px;font-family:Arial,Helvetica,sans-serif;">
        <div style="font-size:11px;color:#8a8a8a;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;">${icone} ${titre}</div>
        <div style="font-size:16px;color:#ffffff;font-weight:700;margin-top:3px;">${valeur}</div>
      </td></tr>
    </table>
  </td></tr>`;
}

// Mail envoyé par le webhook quand le paiement est passé.
export function mailConfirmation(r, montantPaye) {
  const parent = esc((r.prenom || '').trim()) || 'à vous';
  const enfant = esc((r.co1_prenom || '').trim()) || 'votre enfant';
  const prix = typeof montantPaye === 'number' ? montantPaye.toFixed(2).replace('.', ',').replace(',00', '') + ' €' : null;
  const format = esc((FORMATS[r._format] || {}).court || r.niveau || '');
  const tshirtParent = esc([r.tshirt_taille, r.tshirt_coupe].filter(Boolean).join(' ') || '—');
  const tshirtEnfant = esc(r.co1_tshirt || '—');
  const html = `
<div style="background:#000000;padding:20px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#0a0a0a;border-radius:16px;overflow:hidden;">
  <tr><td>${bande(8)}</td></tr>
  <tr><td style="padding:26px 22px 8px;text-align:center;font-family:Arial,Helvetica,sans-serif;">
    <img src="${SITE}/logo-parent-enfant.jpg" width="260" alt="Hyrox Parents / Enfants" style="display:block;width:260px;max-width:80%;height:auto;margin:0 auto 10px;">
    <div style="font-size:34px;line-height:1;font-weight:900;color:#ffffff;letter-spacing:3px;">HYROX</div>
    <div style="font-size:26px;line-height:1.15;font-weight:900;color:#FFEE00;letter-spacing:1px;margin-top:4px;">PARENTS / ENFANTS</div>
    <div style="display:inline-block;background:#a3e635;color:#0a0a0a;font-size:12px;font-weight:900;padding:5px 12px;border-radius:6px;margin-top:10px;letter-spacing:1px;">2ÈME ÉDITION KIDS</div>
  </td></tr>
  <tr><td style="padding:18px 22px 6px;text-align:center;font-family:Arial,Helvetica,sans-serif;">
    <div style="font-size:30px;font-weight:900;color:#ffffff;">C'EST VALIDÉ ! 🎉</div>
    <div style="font-size:15px;color:#cfcfcf;margin-top:8px;line-height:1.5;">Salut ${parent}, votre binôme est inscrit.</div>
  </td></tr>
  <tr><td style="padding:14px 22px 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:14px;background:#141414;border:2px solid #ff3399;">
      <tr><td style="padding:18px 14px;text-align:center;font-family:Arial,Helvetica,sans-serif;">
        <div style="font-size:11px;color:#ff3399;text-transform:uppercase;letter-spacing:2px;font-weight:900;">Le binôme</div>
        <div style="font-size:26px;font-weight:900;color:#ffffff;margin-top:6px;">${parent} <span style="color:#FFEE00;">+</span> ${enfant}</div>
        <div style="font-size:13px;color:#aaaaaa;margin-top:6px;">On fait équipe en famille 💪</div>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 22px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${ligne('#ff3399', '📅', 'Quand', `${DATE_LABEL.charAt(0).toUpperCase() + DATE_LABEL.slice(1)}<div style="font-size:13px;color:#aaaaaa;font-weight:400;margin-top:2px;">Horaire de passage communiqué plus tard par mail</div>`)}
      ${ligne('#FFA726', '📍', 'Où', 'Crossfit La Buse — Saint-Paul')}
      ${ligne('#00d8ff', '🏃', 'Format', format)}
      ${ligne('#a3e635', '👕', 'T-shirts', `Parent : ${tshirtParent} · Enfant : ${tshirtEnfant}`)}
      ${r.pack_photo ? ligne('#ff3399', '📸', 'Pack photo', 'Oui — photos du binôme') : ''}
      ${prix ? ligne('#FFEE00', '💳', 'Montant réglé', prix) : ''}
    </table>
  </td></tr>
  <tr><td style="padding:8px 22px 4px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#cfcfcf;line-height:1.6;text-align:center;">
    À prévoir : une tenue de sport, des baskets et une gourde pour chacun.
  </td></tr>
  <tr><td style="padding:18px 22px 8px;text-align:center;font-family:Arial,Helvetica,sans-serif;">
    <a href="${SITE}/#accueil" style="display:inline-block;background:#FFEE00;color:#0a0a0a;font-weight:900;font-size:15px;text-decoration:none;padding:14px 26px;border-radius:10px;letter-spacing:1px;">TOUTES LES INFOS SUR LE SITE</a>
  </td></tr>
  <tr><td style="padding:14px 22px 22px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8a8a8a;line-height:1.6;">
    L'équipe Hyrox Training Club La Buse<br>Une question ? Réponds à ce mail ou écris-nous à <a href="mailto:${REPLY_TO}" style="color:#FFEE00;">${REPLY_TO}</a>.
  </td></tr>
  <tr><td>${bande(8)}</td></tr>
</table>
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

// Mail court quand le pack photo est ajouté après coup.
export function mailPackPhoto(r) {
  const parent = esc((r.prenom || '').trim()) || 'à vous';
  const enfant = esc((r.co1_prenom || '').trim()) || 'votre enfant';
  const html = `
<div style="background:#000000;padding:20px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#0a0a0a;border-radius:16px;overflow:hidden;">
  <tr><td>${bande(8)}</td></tr>
  <tr><td style="padding:26px 22px;text-align:center;font-family:Arial,Helvetica,sans-serif;">
    <img src="${SITE}/logo-parent-enfant.jpg" width="220" alt="Hyrox Parents / Enfants" style="display:block;width:220px;max-width:80%;height:auto;margin:0 auto 12px;">
    <div style="font-size:28px;font-weight:900;color:#ffffff;">PACK PHOTO VALIDÉ ! 📸</div>
    <div style="font-size:15px;color:#cfcfcf;margin-top:10px;line-height:1.6;">Salut ${parent}, le pack photo est ajouté à votre binôme avec <strong style="color:#fff;">${enfant}</strong> pour le ${DATE_LABEL}.<br>Montant réglé : <strong style="color:#FFEE00;">${PRIX_PACK_PHOTO} €</strong></div>
  </td></tr>
  <tr><td style="padding:0 22px 22px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8a8a8a;line-height:1.6;">
    L'équipe Hyrox Training Club La Buse<br>Une question ? Réponds à ce mail ou écris-nous à <a href="mailto:${REPLY_TO}" style="color:#FFEE00;">${REPLY_TO}</a>.
  </td></tr>
  <tr><td>${bande(8)}</td></tr>
</table>
</div>`;
  return { subject: '📸 Pack photo ajouté — Hyrox Parents / Enfants', html };
}

// Pack photo payé après l'inscription (metadata.type = TYPE_STRIPE_PACK).
export async function traiterPackPhoto(db, session, resendKey) {
  const id = parseInt(session.metadata?.inscription_id, 10);
  if (!id) return { ignored: 'pas d\'inscription_id' };
  const { data: r } = await db.from('Inscriptions').select('*').eq('id', id).eq('categorie', CATEGORIE).single();
  if (!r) return { ignored: 'fiche introuvable ' + id };
  if (r.pack_photo === true) return { id, deja: true };
  const montant = (session.amount_total || 0) / 100;
  await db.from('Inscriptions').update({ pack_photo: true, prix: Number(r.prix || 0) + montant }).eq('id', id);
  if (resendKey && r.email) {
    try { await envoyerMail(resendKey, r.email, mailPackPhoto(r)); }
    catch (e) { console.error('Mail pack photo Parent-Enfant KO', e.message); }
  }
  return { id, pack_photo: true };
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
