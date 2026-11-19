// ============================================================================
// Plateforme photos — logique partagée entre api/photos-admin.js (test admin)
// et api/photos-recherche.js (page des athlètes).
// ============================================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

// Réglages : 0.60 validé sur 15 JPEG, puis abaissé à 0.55 le 20/10/2026 sur ~650
// photos du HC #2 (à 0.60, trop d'intrus quand il y a beaucoup de visages).
// À recalibrer sur les photos du jour J avant d'ouvrir un événement.
export const SEUIL_SELFIE = 0.55;
export const SEUIL_DEUXIEME_TEMPS = 0.45;
export const NB_ANCRES = 5;
// Le 2e temps ne repart que de visages QUASI CERTAINS (19/11/2026) : à 0.50, un visage
// d'un autre enfant servait parfois de modèle et le 2e temps ramenait cet autre enfant.
export const SEUIL_ANCRE = 0.40;

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
      p_evenement: evenementId, p_empreinte: selfie, p_seuil: Math.min(seuil, SEUIL_ANCRE), p_max: NB_ANCRES,
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
// Inscriptions d'un événement correspondant à un email (email principal OU email
// du coéquipier). Seules les inscriptions payées comptent ; l'événement 'test'
// accepte aussi les fausses fiches au statut 'test' (invisibles partout ailleurs).
// --------------------------------------------------------------------------
export function emailValide(e) {
  return /^[^\s@,()<>"']+@[^\s@,()<>"']+\.[^\s@,()<>"']+$/.test(e);
}

function motifExact(e) {
  return e.replace(/[\\%_]/g, c => '\\' + c); // ilike sans jokers = égalité insensible à la casse
}

export async function inscriptionsPourEmail(db, evt, email) {
  const champs = 'id,prenom,nom,email,co1_prenom,co1_email,categorie,statut_paiement,pack_photo,created_at';
  const motif = motifExact(email);
  const [a, b] = await Promise.all([
    db.from('Inscriptions').select(champs).ilike('email', motif).gte('created_at', evt.inscriptions_depuis),
    db.from('Inscriptions').select(champs).ilike('co1_email', motif).gte('created_at', evt.inscriptions_depuis),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  const vues = new Map();
  for (const r of [...a.data, ...b.data]) vues.set(r.id, r);
  return [...vues.values()].filter(r => {
    const statut = String(r.statut_paiement || '').toLowerCase();
    const payee = statut === 'paye' || statut === 'payé' || (evt.id === 'test' && statut === 'test');
    if (!payee) return false;
    const cat = String(r.categorie || '');
    if (evt.type === 'parent_enfant') return cat === 'Parent-Enfant';
    return cat !== 'Parent-Enfant' && !cat.toLowerCase().includes('kids');
  });
}

// Nombre de personnes qu'un accès peut couvrir :
//  - Parent-Enfant : le parent + l'enfant (2) ;
//  - Duo : chacun son espace (1)… sauf si le coéquipier n'a pas laissé d'email :
//    le membre principal peut alors ajouter son/sa partenaire (2) ;
//  - Solo : 1.
export function personnesCouvertes(evt, insc, email) {
  if (evt.type === 'parent_enfant') return 2;
  const duo = String(insc.categorie || '').toLowerCase().startsWith('duo');
  if (!duo) return 1;
  const estPrincipal = String(insc.email || '').toLowerCase() === email;
  return estPrincipal && !String(insc.co1_email || '').includes('@') ? 2 : 1;
}

// Parmi les inscriptions d'un email, celle qui porte le pack photo :
// pris à l'inscription, ou déjà acheté en ligne par un membre de l'équipe.
// Renvoie { insc, origine } — origine = null si personne n'a le pack.
export async function inscriptionEtPack(db, evt, inscriptions) {
  let insc = inscriptions.find(r => r.pack_photo === true);
  if (insc) return { insc, origine: 'pack_inscription' };
  const { data: achats } = await db.from('photos_acces').select('inscription_id')
    .eq('evenement_id', evt.id).eq('origine', 'achat_en_ligne').eq('statut', 'actif')
    .in('inscription_id', inscriptions.map(r => r.id));
  if (achats && achats.length) {
    return { insc: inscriptions.find(r => r.id === achats[0].inscription_id), origine: 'achat_en_ligne' };
  }
  return { insc: inscriptions[0], origine: null };
}

// --------------------------------------------------------------------------
// Équipe, photos offertes et limite du pack (nouveau parcours du 19/11/2026) :
// l'athlète parcourt toutes les photos et CHOISIT lui-même.
//  - photos offertes : N par ÉQUIPE (inscription), choisies à la main, définitives ;
//  - pack : LIMITE_PACK photos par équipe (solo, Duo ou binôme), ajouts compris.
// --------------------------------------------------------------------------
export const LIMITE_PACK = 50;

// { type: 'solo'|'duo'|'parent_enfant', partenaire: prénom de l'autre membre ou null }
export function equipe(evt, insc, email) {
  const type = evt.type === 'parent_enfant' ? 'parent_enfant'
    : String(insc.categorie || '').toLowerCase().startsWith('duo') ? 'duo' : 'solo';
  const estPrincipal = String(insc.email || '').toLowerCase() === String(email || '').toLowerCase();
  const autre = String((estPrincipal ? insc.co1_prenom : insc.prenom) || '').trim();
  return { type, partenaire: type === 'solo' ? null : (autre || null) };
}

export async function gratuitesEquipe(db, evenementId, inscriptionId) {
  const { data, error } = await db.from('photos_gratuites').select('photo_ids')
    .eq('evenement_id', evenementId).eq('inscription_id', inscriptionId).maybeSingle();
  if (error) throw error;
  return data ? [...data.photo_ids] : [];
}

// Ajoute les photos choisies aux photos offertes de l'équipe, sans dépasser N.
export async function choisirGratuites(db, evt, inscriptionId, ids) {
  const deja = await gratuitesEquipe(db, evt.id, inscriptionId);
  const place = Math.max(0, evt.nb_gratuites - deja.length);
  const ajout = (await photosValides(db, evt.id, ids)).filter(id => !deja.includes(id)).slice(0, place);
  if (!ajout.length) return deja;
  const toutes = [...deja, ...ajout];
  const { error } = await db.from('photos_gratuites').upsert({
    evenement_id: evt.id, inscription_id: inscriptionId, photo_ids: toutes, updated_at: new Date().toISOString(),
  }, { onConflict: 'evenement_id,inscription_id' });
  if (error) throw error;
  return toutes;
}

// Toutes les photos du pack de l'équipe (chaque membre d'un Duo a son propre espace).
export async function photosPackEquipe(db, evenementId, inscriptionId) {
  const { data, error } = await db.from('photos_acces').select('photo_ids')
    .eq('evenement_id', evenementId).eq('inscription_id', inscriptionId).eq('statut', 'actif');
  if (error) throw error;
  return new Set(data.flatMap(r => r.photo_ids || []));
}

// Chaque personne a droit à quelques selfies (« il me manque des photos »).
export const SELFIES_PAR_PERSONNE = 3;

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

// --------------------------------------------------------------------------
// Galerie complète de l'événement (ajoutée le 19/11/2026) : la reconnaissance
// n'est qu'un raccourci, l'athlète peut parcourir TOUTES les photos (aperçus
// filigranés) et ajouter lui-même celles où il se reconnaît.
// --------------------------------------------------------------------------
export const GALERIE_PAR_PAGE = 48;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Une page de la galerie, dans l'ordre de prise de vue (par photographe, puis nom de fichier).
export async function pageGalerie(db, evenementId, debut = 0) {
  const d = Math.max(0, Number.isInteger(debut) ? debut : 0);
  const { data, error, count } = await db.from('photos_fichiers')
    .select('id,photographe', { count: 'exact' })
    .eq('evenement_id', evenementId).eq('statut', 'pret')
    .order('photographe').order('nom_origine')
    .range(d, d + GALERIE_PAR_PAGE - 1);
  if (error) throw error;
  return { photos: data, total: count || 0, suivant: d + data.length < (count || 0) ? d + data.length : null };
}

// Garde seulement les identifiants de photos prêtes de CET événement (choix faits dans la galerie).
export async function photosValides(db, evenementId, ids) {
  const propres = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(id => UUID.test(id)))].slice(0, 500);
  if (!propres.length) return [];
  const { data, error } = await db.from('photos_fichiers').select('id')
    .eq('evenement_id', evenementId).eq('statut', 'pret').in('id', propres);
  if (error) throw error;
  const ok = new Set(data.map(r => r.id));
  return propres.filter(id => ok.has(id));
}
