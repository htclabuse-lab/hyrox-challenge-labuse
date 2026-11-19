import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../lib/kids.js';
import { lienSigne, clesPhoto } from '../lib/r2.js';
import {
  rechercherPhotos, empreinteValide, signerBon, emailValide, inscriptionsPourEmail, inscriptionEtPack,
  pageGalerie, equipe, gratuitesEquipe, choisirGratuites, photosPackEquipe, LIMITE_PACK,
} from '../lib/photos.js';

// ============================================================================
// Plateforme photos — page photos.html des athlètes (parcours du 19/11/2026) :
// l'athlète entre l'email de son inscription, parcourt TOUTES les photos (en
// filigrane), peut s'aider d'un selfie pour retrouver les siennes, puis choisit
// ses N photos offertes (par équipe) ou ses photos du pack (LIMITE_PACK par équipe).
//
//  POST { action: 'evenements' }                → événements ouverts
//  POST { action: 'evenement', evenement_id }   → un événement (ouvert, ou 'test')
//  POST { action: 'profil', evenement_id, email | jeton }
//        → équipe (solo / duo / parent_enfant + prénom du partenaire), pack ou non,
//          photos offertes déjà choisies par l'équipe (avec liens), photos du pack déjà prises
//  POST { action: 'galerie', evenement_id, email | jeton, debut? }
//        → une page de TOUTES les photos de l'événement (aperçus filigranés)
//  POST { action: 'rechercher', evenement_id, empreinte: [128 nombres], email | jeton }
//        → photos où l'athlète apparaît probablement (aperçus filigranés), pour l'aider à choisir
//  POST { action: 'gratuites', evenement_id, email, photo_ids }
//        → enregistre le choix des photos offertes de l'équipe (définitif) et renvoie leurs liens
//
// Seuls les inscrits de l'événement (email) ou un espace photo (jeton) y ont accès.
// Le selfie n'arrive JAMAIS ici : le téléphone envoie seulement l'empreinte
// (128 nombres), qui n'est ni enregistrée ni journalisée.
// ============================================================================

const CHAMPS_EVT = 'id,nom,date_evenement,type,nb_gratuites,prix_pack_cents,statut,inscriptions_depuis,visages_effaces_le';

// Aperçu admin : avec le mot de passe photos, on voit un événement pas encore ouvert
// (pour vérifier la page des athlètes avant l'ouverture). Rien n'est enregistré.
const estApercu = b => !!process.env.PHOTOS_ADMIN_PASSWORD && b.apercu === process.env.PHOTOS_ADMIN_PASSWORD;

async function evenementVisible(db, id, apercu = false) {
  const { data } = await db.from('photos_evenements').select(CHAMPS_EVT).eq('id', String(id || '')).maybeSingle();
  if (!data) return null;
  if (apercu) return data;
  // 'test' reste accessible (par lien direct) pour nos essais, même en brouillon.
  return data.statut === 'ouvert' || data.id === 'test' ? data : null;
}

// Qui est là ? Un inscrit (email) ou un espace photo déjà débloqué (jeton).
// Renvoie { insc, email, aLePack } ou { code, erreur }.
async function identifier(db, evt, b) {
  if (b.jeton) {
    const { data: acces } = await db.from('photos_acces').select('inscription_id,email')
      .eq('jeton', String(b.jeton)).eq('evenement_id', evt.id).eq('statut', 'actif').maybeSingle();
    if (!acces) return { code: 404, erreur: 'Lien invalide ou expiré.' };
    const { data: insc } = await db.from('Inscriptions').select('id,prenom,email,co1_prenom,co1_email,categorie')
      .eq('id', acces.inscription_id).single();
    return { insc, email: acces.email, aLePack: true };
  }
  const email = String(b.email || '').trim().toLowerCase();
  if (!emailValide(email)) return { code: 400, erreur: "Entre l'adresse email de ton inscription." };
  const inscriptions = await inscriptionsPourEmail(db, evt, email);
  if (!inscriptions.length) {
    return { code: 404, erreur: "Aucune inscription trouvée avec cet email pour cet événement. Utilise bien l'adresse de ton inscription." };
  }
  const { insc, origine } = await inscriptionEtPack(db, evt, inscriptions);
  return { insc, email, aLePack: !!origine };
}

async function liensGratuites(evt, ids) {
  const photos = [];
  for (const [i, id] of ids.entries()) {
    const cles = clesPhoto(evt.id, id);
    photos.push({
      photo_id: id,
      nette: await lienSigne('GET', cles.web, { expireSecondes: 3600 }),
      telecharger: await lienSigne('GET', cles.web, { expireSecondes: 3600, telechargerSous: `HTC-La-Buse-${evt.id}-offerte-${i + 1}.jpg` }),
    });
  }
  return photos;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  const b = req.body || {};
  const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    if (b.action === 'evenements') {
      const { data, error } = await db.from('photos_evenements').select(CHAMPS_EVT)
        .eq('statut', 'ouvert').order('date_evenement', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ evenements: data });
    }

    const evt = await evenementVisible(db, b.evenement_id, estApercu(b));
    if (!evt) return res.status(404).json({ error: 'Événement introuvable ou pas encore ouvert.' });

    if (b.action === 'evenement') return res.status(200).json({ evenement: evt });

    if (!['profil', 'galerie', 'rechercher', 'gratuites'].includes(b.action)) {
      return res.status(400).json({ error: 'Action inconnue' });
    }
    const qui = await identifier(db, evt, b);
    if (qui.erreur) return res.status(qui.code).json({ error: qui.erreur });

    if (b.action === 'profil') {
      const [gratuites, pack] = await Promise.all([
        gratuitesEquipe(db, evt.id, qui.insc.id),
        photosPackEquipe(db, evt.id, qui.insc.id),
      ]);
      return res.status(200).json({
        evenement: evt,
        prenom: qui.insc.email?.toLowerCase() === qui.email ? (qui.insc.prenom || '') : '',
        equipe: equipe(evt, qui.insc, qui.email),
        a_le_pack: qui.aLePack,
        gratuites: { max: evt.nb_gratuites, photos: await liensGratuites(evt, gratuites) },
        pack: { limite: LIMITE_PACK, deja: [...pack] },
      });
    }

    if (b.action === 'galerie') {
      const page = await pageGalerie(db, evt.id, b.debut);
      const photos = [];
      for (const p of page.photos) {
        photos.push({ photo_id: p.id, photographe: p.photographe, apercu: await lienSigne('GET', clesPhoto(evt.id, p.id).apercu, { expireSecondes: 3600 }) });
      }
      return res.status(200).json({ photos, total: page.total, suivant: page.suivant });
    }

    if (b.action === 'rechercher') {
      // Après l'effacement automatique des visages (60 jours), la recherche n'est plus possible.
      if (evt.visages_effaces_le) {
        return res.status(410).json({ error: "La recherche par selfie est terminée pour cet événement : comme prévu, les données des visages ont été effacées. Tu peux toujours parcourir toutes les photos." });
      }
      if (!empreinteValide(b.empreinte)) return res.status(400).json({ error: 'Visage illisible, réessaie avec un autre selfie.' });
      const trouvees = await rechercherPhotos(db, evt.id, b.empreinte);
      const photos = [];
      for (const t of trouvees) {
        photos.push({
          photo_id: t.photo_id, distance: Math.round(t.distance * 1000) / 1000, via: t.via,
          apercu: await lienSigne('GET', clesPhoto(evt.id, t.photo_id).apercu, { expireSecondes: 3600 }),
        });
      }
      return res.status(200).json({ photos, bon: signerBon(evt.id, trouvees.map(t => t.photo_id)) });
    }

    if (b.action === 'gratuites') {
      if (estApercu(b)) return res.status(403).json({ error: "En mode aperçu, rien n'est enregistré : le choix des photos offertes est désactivé." });
      const ids = await choisirGratuites(db, evt, qui.insc.id, b.photo_ids);
      return res.status(200).json({ gratuites: { max: evt.nb_gratuites, photos: await liensGratuites(evt, ids) } });
    }
  } catch (e) {
    console.error('photos-recherche', b.action, e);
    return res.status(500).json({ error: 'Erreur serveur, réessaie dans un instant.' });
  }
}
