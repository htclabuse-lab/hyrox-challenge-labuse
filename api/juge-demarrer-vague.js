import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { password, vague } = req.body || {};

    if (!password || password !== process.env.JUGES_PASSWORD) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    if (!Number.isInteger(vague) || vague <= 0) {
      return res.status(400).json({ error: 'vague invalide' });
    }

    const supabaseUrl = 'https://mzyfnmjzlosranptwucr.supabase.co';
    const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY);

    const heureDepart = new Date().toISOString();

    // Écrit dans heure_debut_reelle (nouvelle colonne) pour ne pas écraser l'heure prévue (heure_depart)
    const { data, error } = await supabase
      .from('Inscriptions')
      .update({ heure_debut_reelle: heureDepart })
      .eq('vague', vague)
      .is('heure_debut_reelle', null)
      .select('id');

    if (error) {
      console.error('Erreur Supabase juge-demarrer-vague:', error);
      return res.status(500).json({ error: 'Erreur base de données' });
    }

    const athletes_updated = data ? data.length : 0;

    if (athletes_updated === 0) {
      return res.status(409).json({ error: 'Vague déjà démarrée ou aucun athlète sur cette vague' });
    }

    return res.status(200).json({ success: true, athletes_updated, heure_debut_reelle: heureDepart });
  } catch (err) {
    console.error('Erreur juge-demarrer-vague:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
