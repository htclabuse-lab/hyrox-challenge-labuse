import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../lib/kids.js';
import { lienSigne, clesPhoto } from '../lib/r2.js';
import { rechercherPhotos, empreinteValide, SEUIL_SELFIE, SEUIL_DEUXIEME_TEMPS } from '../lib/photos.js';

// ============================================================================
// Plateforme photos — fonctions serveur de la page photos-indexeur.html.
// Protégé par le mot de passe PHOTOS_ADMIN_PASSWORD (variable Vercel).
//
//  POST { password, action: 'evenements' }
//        → liste des événements + nombre de photos prêtes
//  POST { password, action: 'deja_faits', evenement_id, photographe }
//        → noms des fichiers déjà traités (pour reprendre là où on s'était arrêté)
//  POST { password, action: 'preparer', evenement_id, photographe, nom_origine, largeur, hauteur, taille_octets }
//        → crée la ligne photo + 3 tickets de dépôt R2 (hd, web, apercu), valables 15 min
//  POST { password, action: 'terminer', photo_id, visages: [{ empreinte: [128 nombres], cadre, score }] }
//        → enregistre les empreintes et marque la photo « prête »
//  POST { password, action: 'tester', evenement_id, empreinte: [128 nombres], seuil?, deux_temps?, seuil2? }
//        → photos ressemblantes (aperçus filigranés) — pour vérifier l'indexation
// ============================================================================

const MAX_VISAGES_PAR_PHOTO = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const b = req.body || {};
  if (!process.env.PHOTOS_ADMIN_PASSWORD || b.password !== process.env.PHOTOS_ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    if (b.action === 'evenements') {
      const { data, error } = await db.from('photos_evenements')
        .select('id,nom,date_evenement,statut').order('date_evenement', { ascending: false });
      if (error) throw error;
      for (const e of data) {
        const { count } = await db.from('photos_fichiers').select('id', { count: 'exact', head: true })
          .eq('evenement_id', e.id).eq('statut', 'pret');
        e.nb_photos = count || 0;
      }
      return res.status(200).json({ evenements: data });
    }

    if (b.action === 'deja_faits') {
      const noms = [];
      // Supabase renvoie 1000 lignes max par requête : on lit par paquets.
      for (let debut = 0; ; debut += 1000) {
        const { data, error } = await db.from('photos_fichiers').select('nom_origine')
          .eq('evenement_id', b.evenement_id).eq('photographe', b.photographe).eq('statut', 'pret')
          .range(debut, debut + 999);
        if (error) throw error;
        noms.push(...data.map(r => r.nom_origine));
        if (data.length < 1000) break;
      }
      return res.status(200).json({ noms });
    }

    if (b.action === 'preparer') {
      const photographe = String(b.photographe || '').trim();
      const nom = String(b.nom_origine || '').trim();
      if (!b.evenement_id || !photographe || !nom) return res.status(400).json({ error: 'Champs manquants' });
      const { data, error } = await db.from('photos_fichiers').upsert({
        evenement_id: b.evenement_id,
        photographe,
        nom_origine: nom,
        largeur: Number.isInteger(b.largeur) ? b.largeur : null,
        hauteur: Number.isInteger(b.hauteur) ? b.hauteur : null,
        taille_octets: Number.isInteger(b.taille_octets) ? b.taille_octets : null,
        statut: 'en_cours',
      }, { onConflict: 'evenement_id,photographe,nom_origine' }).select('id').single();
      if (error) throw error;
      const cles = clesPhoto(b.evenement_id, data.id);
      const ttl = { expireSecondes: 900 };
      return res.status(200).json({
        photo_id: data.id,
        depots: {
          hd: await lienSigne('PUT', cles.hd, ttl),
          web: await lienSigne('PUT', cles.web, ttl),
          apercu: await lienSigne('PUT', cles.apercu, ttl),
        },
      });
    }

    if (b.action === 'terminer') {
      const visages = Array.isArray(b.visages) ? b.visages.slice(0, MAX_VISAGES_PAR_PHOTO) : [];
      for (const v of visages) {
        if (!Array.isArray(v.empreinte) || v.empreinte.length !== 128 || !v.empreinte.every(Number.isFinite)) {
          return res.status(400).json({ error: 'Empreinte invalide' });
        }
      }
      const { data: photo, error: pErr } = await db.from('photos_fichiers')
        .select('id,evenement_id').eq('id', b.photo_id).single();
      if (pErr || !photo) return res.status(404).json({ error: 'Photo introuvable' });

      // Si la photo avait déjà été (partiellement) traitée, on repart de zéro.
      const { error: dErr } = await db.from('photos_visages').delete().eq('photo_id', photo.id);
      if (dErr) throw dErr;
      if (visages.length) {
        const { error: iErr } = await db.from('photos_visages').insert(visages.map(v => ({
          photo_id: photo.id,
          evenement_id: photo.evenement_id,
          empreinte: '[' + v.empreinte.join(',') + ']',
          cadre: v.cadre || null,
          score: Number.isFinite(v.score) ? v.score : null,
        })));
        if (iErr) throw iErr;
      }
      const { error: uErr } = await db.from('photos_fichiers')
        .update({ statut: 'pret', nb_visages: visages.length }).eq('id', photo.id);
      if (uErr) throw uErr;
      return res.status(200).json({ ok: true, nb_visages: visages.length });
    }

    if (b.action === 'tester') {
      // Test admin : recherche à partir d'une empreinte de selfie (rien n'est enregistré).
      const e = b.empreinte;
      if (!empreinteValide(e)) return res.status(400).json({ error: 'Empreinte invalide' });
      const trouvees = await rechercherPhotos(db, b.evenement_id, e, {
        seuil: Number.isFinite(b.seuil) ? Math.min(Math.max(b.seuil, 0.3), 0.7) : SEUIL_SELFIE,
        deuxTemps: !!b.deux_temps,
        seuil2: Number.isFinite(b.seuil2) ? Math.min(Math.max(b.seuil2, 0.3), 0.6) : SEUIL_DEUXIEME_TEMPS,
        max: 60,
      });
      const photos = [];
      for (const t of trouvees) {
        photos.push({ ...t, url: await lienSigne('GET', clesPhoto(b.evenement_id, t.photo_id).apercu) });
      }
      return res.status(200).json({ photos });
    }

    return res.status(400).json({ error: 'Action inconnue' });
  } catch (e) {
    console.error('photos-admin', b.action, e);
    return res.status(500).json({ error: e.message || 'Erreur serveur' });
  }
}
