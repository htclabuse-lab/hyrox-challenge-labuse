import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../lib/kids.js';
import { lienSigne, clesPhoto } from '../lib/r2.js';
import {
  rechercherPhotos, empreinteValide, signerBon, emailValide, inscriptionsPourEmail, inscriptionEtPack, photosOffertes,
  pageGalerie,
} from '../lib/photos.js';

// ============================================================================
// Plateforme photos — recherche publique (page photos.html des athlètes).
//
//  POST { action: 'evenements' }                → événements ouverts
//  POST { action: 'evenement', evenement_id }   → un événement (ouvert, ou 'test')
//  POST { action: 'rechercher', evenement_id, empreinte: [128 nombres], email | jeton }
//        → photos trouvées (aperçu filigrané pour toutes, version nette en plus pour
//          les photos OFFERTES À L'ÉQUIPE : N par inscription, retenues en base) +
//          un « bon de recherche » signé à renvoyer au moment du déblocage.
//        L'email doit être celui d'une inscription à l'événement (ou, depuis l'espace
//        photo, le jeton de l'espace) : seuls les athlètes inscrits peuvent chercher.
//  POST { action: 'galerie', evenement_id, email | jeton, debut? }
//        → une page de TOUTES les photos de l'événement (aperçus filigranés), pour
//          retrouver soi-même celles que la reconnaissance a ratées. Mêmes droits
//          que la recherche (inscrit ou espace photo).
//
// Le selfie n'arrive JAMAIS ici : le téléphone envoie seulement l'empreinte
// (128 nombres), qui n'est ni enregistrée ni journalisée.
// ============================================================================

const CHAMPS_EVT = 'id,nom,date_evenement,type,nb_gratuites,prix_pack_cents,statut,inscriptions_depuis,visages_effaces_le';

// Aperçu admin : avec le mot de passe photos, on voit un événement pas encore ouvert
// (pour vérifier la page des athlètes avant l'ouverture). Rien n'est offert ni enregistré.
const estApercu = b => !!process.env.PHOTOS_ADMIN_PASSWORD && b.apercu === process.env.PHOTOS_ADMIN_PASSWORD;

async function evenementVisible(db, id, apercu = false) {
  const { data } = await db.from('photos_evenements').select(CHAMPS_EVT).eq('id', String(id || '')).maybeSingle();
  if (!data) return null;
  if (apercu) return data;
  // 'test' reste accessible (par lien direct) pour nos essais, même en brouillon.
  return data.statut === 'ouvert' || data.id === 'test' ? data : null;
}

// Qui cherche ? Un inscrit (email) ou un espace photo déjà débloqué (jeton).
async function identifier(db, evt, b) {
  if (b.jeton) {
    const { data: acces } = await db.from('photos_acces').select('inscription_id')
      .eq('jeton', String(b.jeton)).eq('evenement_id', evt.id).eq('statut', 'actif').maybeSingle();
    if (!acces) return { code: 404, erreur: 'Lien invalide ou expiré.' };
    return { inscriptionId: acces.inscription_id, aLePack: true };
  }
  const email = String(b.email || '').trim().toLowerCase();
  if (!emailValide(email)) return { code: 400, erreur: "Entre l'adresse email de ton inscription." };
  const inscriptions = await inscriptionsPourEmail(db, evt, email);
  if (!inscriptions.length) {
    return { code: 404, erreur: "Aucune inscription trouvée avec cet email pour cet événement. Utilise bien l'adresse de ton inscription." };
  }
  const { insc, origine } = await inscriptionEtPack(db, evt, inscriptions);
  return { inscriptionId: insc.id, aLePack: !!origine };
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

    if (b.action === 'evenement') {
      const evt = await evenementVisible(db, b.evenement_id, estApercu(b));
      if (!evt) return res.status(404).json({ error: 'Événement introuvable ou pas encore ouvert.' });
      return res.status(200).json({ evenement: evt });
    }

    if (b.action === 'rechercher') {
      const evt = await evenementVisible(db, b.evenement_id, estApercu(b));
      if (!evt) return res.status(404).json({ error: 'Événement introuvable ou pas encore ouvert.' });
      // Après l'effacement automatique des visages (60 jours), la recherche n'est plus possible.
      if (evt.visages_effaces_le) {
        return res.status(410).json({ error: "La recherche par selfie est terminée pour cet événement : comme prévu, les données des visages ont été effacées. Si tu as débloqué tes photos, elles restent disponibles avec le lien reçu par mail." });
      }
      if (!empreinteValide(b.empreinte)) return res.status(400).json({ error: 'Visage illisible, réessaie avec un autre selfie.' });

      const qui = await identifier(db, evt, b);
      if (qui.erreur) return res.status(qui.code).json({ error: qui.erreur });
      const { inscriptionId, aLePack } = qui;

      const trouvees = await rechercherPhotos(db, evt.id, b.empreinte);
      const offertes = estApercu(b) ? new Set() : await photosOffertes(db, evt, inscriptionId, trouvees);
      const photos = [];
      let n = 0;
      for (const t of trouvees) {
        const cles = clesPhoto(evt.id, t.photo_id);
        const p = { photo_id: t.photo_id, distance: Math.round(t.distance * 1000) / 1000, via: t.via, apercu: await lienSigne('GET', cles.apercu) };
        if (offertes.has(t.photo_id)) {
          p.nette = await lienSigne('GET', cles.web);
          p.telecharger = await lienSigne('GET', cles.web, { telechargerSous: `HTC-La-Buse-${evt.id}-offerte-${++n}.jpg` });
        }
        photos.push(p);
      }
      return res.status(200).json({
        evenement: evt,
        photos,
        a_le_pack: aLePack,
        bon: signerBon(evt.id, trouvees.map(t => t.photo_id)),
      });
    }

    if (b.action === 'galerie') {
      const evt = await evenementVisible(db, b.evenement_id, estApercu(b));
      if (!evt) return res.status(404).json({ error: 'Événement introuvable ou pas encore ouvert.' });
      const qui = await identifier(db, evt, b);
      if (qui.erreur) return res.status(qui.code).json({ error: qui.erreur });
      const page = await pageGalerie(db, evt.id, b.debut);
      const photos = [];
      for (const p of page.photos) {
        photos.push({ photo_id: p.id, photographe: p.photographe, apercu: await lienSigne('GET', clesPhoto(evt.id, p.id).apercu, { expireSecondes: 3600 }) });
      }
      return res.status(200).json({ photos, total: page.total, suivant: page.suivant });
    }

    return res.status(400).json({ error: 'Action inconnue' });
  } catch (e) {
    console.error('photos-recherche', b.action, e);
    return res.status(500).json({ error: 'Erreur serveur, réessaie dans un instant.' });
  }
}
