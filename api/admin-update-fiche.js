import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../lib/kids.js';

// ============================================================================
// Correction d'une fiche d'inscription (la clé publique ne peut plus faire d'UPDATE).
//
//  POST { password, id, champs: { co1_tshirt: '12-14 ans', ... } }
//  → met à jour uniquement les colonnes autorisées ci-dessous, renvoie la fiche.
// ============================================================================

const AUTORISES = [
  'prenom', 'nom', 'email', 'telephone', 'date_naissance', 'genre',
  'categorie',
  'tshirt_coupe', 'tshirt_taille', 'niveau', 'prix', 'statut_paiement', 'pack_photo', 'droit_image', 'sante_declaree',
  'co1_prenom', 'co1_nom', 'co1_date_naissance', 'co1_tshirt',
  'contact_urgence_prenom', 'contact_urgence_nom', 'contact_urgence_tel',
  'vague', 'heure_depart',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  const b = req.body || {};
  if (!process.env.JUGES_PASSWORD || b.password !== process.env.JUGES_PASSWORD) return res.status(401).json({ error: 'Non autorisé' });
  if (!process.env.SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'Configuration serveur incomplète' });
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id invalide' });
  const champs = b.champs || {};
  const refuses = Object.keys(champs).filter(k => !AUTORISES.includes(k));
  if (refuses.length) return res.status(400).json({ error: 'Champs non autorisés : ' + refuses.join(', ') });
  if (!Object.keys(champs).length) return res.status(400).json({ error: 'Aucun champ à modifier' });

  const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db.from('Inscriptions').update(champs).eq('id', id).select('*');
  if (error) return res.status(500).json({ error: error.message });
  if (!data || !data.length) return res.status(404).json({ error: 'Fiche introuvable' });
  return res.status(200).json({ ok: true, fiche: data[0] });
}
