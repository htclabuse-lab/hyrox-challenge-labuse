import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { password } = req.body || {};

    if (!password || password !== process.env.JUGES_PASSWORD) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const supabaseUrl = 'https://mzyfnmjzlosranptwucr.supabase.co';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('Inscriptions')
      .select('id, dossard, nom, prenom, categorie, nom_equipe, vague, heure_depart, statut_paiement')
      .not('dossard', 'is', null)
      .order('dossard', { ascending: true });

    if (error) {
      console.error('Erreur Supabase juge-liste:', error);
      return res.status(500).json({ error: 'Erreur base de données' });
    }

    return res.status(200).json({ inscriptions: data || [] });
  } catch (err) {
    console.error('Erreur juge-liste:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
