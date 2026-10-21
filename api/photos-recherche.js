import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../lib/kids.js';
import { lienSigne, clesPhoto } from '../lib/r2.js';
import { rechercherPhotos, empreinteValide, signerBon } from '../lib/photos.js';

// ============================================================================
// Plateforme photos — recherche publique (page photos.html des athlètes).
//
//  POST { action: 'evenements' }                → événements ouverts
//  POST { action: 'evenement', evenement_id }   → un événement (ouvert, ou 'test')
//  POST { action: 'rechercher', evenement_id, empreinte: [128 nombres] }
//        → photos trouvées (aperçu filigrané pour toutes, version nette en plus pour
//          les N plus ressemblantes = gratuites) + un « bon de recherche » signé à
//          renvoyer au moment du déblocage.
//
// Le selfie n'arrive JAMAIS ici : le téléphone envoie seulement l'empreinte
// (128 nombres), qui n'est ni enregistrée ni journalisée.
// ============================================================================

const CHAMPS_EVT = 'id,nom,date_evenement,type,nb_gratuites,prix_pack_cents,statut';

async function evenementVisible(db, id) {
  const { data } = await db.from('photos_evenements').select(CHAMPS_EVT).eq('id', String(id || '')).maybeSingle();
  if (!data) return null;
  // 'test' reste accessible (par lien direct) pour nos essais, même en brouillon.
  return data.statut === 'ouvert' || data.id === 'test' ? data : null;
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
      const evt = await evenementVisible(db, b.evenement_id);
      if (!evt) return res.status(404).json({ error: 'Événement introuvable ou pas encore ouvert.' });
      return res.status(200).json({ evenement: evt });
    }

    if (b.action === 'rechercher') {
      const evt = await evenementVisible(db, b.evenement_id);
      if (!evt) return res.status(404).json({ error: 'Événement introuvable ou pas encore ouvert.' });
      if (!empreinteValide(b.empreinte)) return res.status(400).json({ error: 'Visage illisible, réessaie avec un autre selfie.' });

      const trouvees = await rechercherPhotos(db, evt.id, b.empreinte);
      const photos = [];
      // Toutes les photos ont un aperçu filigrané ; les N premières ont aussi leur
      // version nette (la page n'en affiche que N au total, même après un 2e selfie).
      for (const [i, t] of trouvees.entries()) {
        const cles = clesPhoto(evt.id, t.photo_id);
        const p = { photo_id: t.photo_id, distance: Math.round(t.distance * 1000) / 1000, via: t.via, apercu: await lienSigne('GET', cles.apercu) };
        if (i < evt.nb_gratuites) {
          p.nette = await lienSigne('GET', cles.web);
          p.telecharger = await lienSigne('GET', cles.web, { telechargerSous: `HTC-La-Buse-${evt.id}-offerte-${i + 1}.jpg` });
        }
        photos.push(p);
      }
      return res.status(200).json({
        evenement: evt,
        photos,
        bon: signerBon(evt.id, trouvees.map(t => t.photo_id)),
      });
    }

    return res.status(400).json({ error: 'Action inconnue' });
  } catch (e) {
    console.error('photos-recherche', b.action, e);
    return res.status(500).json({ error: 'Erreur serveur, réessaie dans un instant.' });
  }
}
