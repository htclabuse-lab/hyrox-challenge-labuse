import { createClient } from '@supabase/supabase-js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { password, pointage_id } = req.body || {};

    if (!password || password !== process.env.JUGES_PASSWORD) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    if (typeof pointage_id !== 'string' || !UUID_REGEX.test(pointage_id)) {
      return res.status(400).json({ error: 'pointage_id invalide' });
    }

    const supabaseUrl = 'https://mzyfnmjzlosranptwucr.supabase.co';
    const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY);

    const { data, error } = await supabase
      .from('Pointages')
      .delete()
      .eq('id', pointage_id)
      .select('id');

    if (error) {
      console.error('Erreur Supabase juge-annuler-pointage:', error);
      return res.status(500).json({ error: 'Erreur base de données' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Pointage introuvable (déjà supprimé ?)' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Erreur juge-annuler-pointage:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
