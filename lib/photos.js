// ============================================================================
// Plateforme photos — logique partagée entre api/photos-admin.js (test admin)
// et api/photos-recherche.js (page des athlètes).
// ============================================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

// Réglages validés le 20/10/2026 sur de vrais JPEG : 0.60 = limite sans intrus.
// À recalibrer sur les photos du jour J avant d'ouvrir un événement.
export const SEUIL_SELFIE = 0.60;
export const SEUIL_DEUXIEME_TEMPS = 0.45;
export const NB_ANCRES = 5;

export function empreinteValide(e) {
  return Array.isArray(e) && e.length === 128 && e.every(Number.isFinite);
}

// Recherche « en deux temps » :
//  1. photos où un visage ressemble au selfie (< seuil) ;
//  2. les visages les plus sûrs trouvés servent à leur tour de modèle (seuil plus strict).
// Renvoie [{ photo_id, distance, via: 'selfie' | '2e temps' }], les plus ressemblantes d'abord.
export async function rechercherPhotos(db, evenementId, empreinte, {
  seuil = SEUIL_SELFIE, deuxTemps = true, seuil2 = SEUIL_DEUXIEME_TEMPS, max = 300,
} = {}) {
  const selfie = '[' + empreinte.join(',') + ']';
  const { data, error } = await db.rpc('photos_rechercher', {
    p_evenement: evenementId, p_empreinte: selfie, p_seuil: seuil, p_max: max,
  });
  if (error) throw error;
  const trouvees = new Map(data.map(r => [r.photo_id, { distance: r.distance, via: 'selfie' }]));

  if (deuxTemps) {
    const { data: ancres, error: aErr } = await db.rpc('photos_visages_proches', {
      p_evenement: evenementId, p_empreinte: selfie, p_seuil: Math.min(seuil, 0.5), p_max: NB_ANCRES,
    });
    if (aErr) throw aErr;
    for (const a of ancres) {
      const { data: d2, error: e2 } = await db.rpc('photos_rechercher', {
        p_evenement: evenementId, p_empreinte: a.empreinte, p_seuil: seuil2, p_max: max,
      });
      if (e2) throw e2;
      for (const r of d2) {
        if (!trouvees.has(r.photo_id)) trouvees.set(r.photo_id, { distance: r.distance, via: '2e temps' });
      }
    }
  }

  return [...trouvees].map(([photo_id, t]) => ({ photo_id, ...t }))
    .sort((a, b) => (a.via === b.via ? a.distance - b.distance : a.via === 'selfie' ? -1 : 1));
}

// --------------------------------------------------------------------------
// « Bon de recherche » signé : la liste des photos trouvées pour un selfie.
// Au moment du déblocage, l'athlète renvoie ce bon ; la signature garantit qu'il
// n'a pas ajouté à la main les photos de quelqu'un d'autre. Valable 24 h.
// --------------------------------------------------------------------------
const DUREE_BON_MS = 24 * 3600 * 1000;

function cleBon() {
  const k = process.env.SUPABASE_SERVICE_KEY;
  if (!k) throw new Error('Configuration serveur incomplète');
  return 'photos-bon:' + k;
}

export function signerBon(evenementId, photoIds) {
  const corps = Buffer.from(JSON.stringify({ e: evenementId, p: photoIds, t: Date.now() })).toString('base64url');
  const sig = createHmac('sha256', cleBon()).update(corps).digest('base64url');
  return corps + '.' + sig;
}

// Renvoie { evenementId, photoIds } ou null si le bon est faux ou périmé.
export function lireBon(bon) {
  const [corps, sig] = String(bon || '').split('.');
  if (!corps || !sig) return null;
  const attendu = createHmac('sha256', cleBon()).update(corps).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(attendu);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(corps, 'base64url').toString());
    if (Date.now() - d.t > DUREE_BON_MS) return null;
    return { evenementId: d.e, photoIds: d.p };
  } catch (e) {
    return null;
  }
}
