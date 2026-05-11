import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { password, station } = req.body || {};

    if (!password || password !== process.env.JUGES_PASSWORD) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    if (!Number.isInteger(station) || station < 1 || station > 8) {
      return res.status(400).json({ error: 'station doit être un entier entre 1 et 8' });
    }

    const supabaseUrl = 'https://mzyfnmjzlosranptwucr.supabase.co';
    const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY);

    const { data, error } = await supabase
      .from('Pointages')
      .select('id, inscription_id, timestamp_pointage, penalite_30s, penalite_5min, juge_nom')
      .eq('station', station)
      .order('timestamp_pointage', { ascending: false });

    if (error) {
      console.error('Erreur Supabase juge-pointages-station:', error);
      return res.status(500).json({ error: 'Erreur base de données' });
    }

    return res.status(200).json({ pointages: data || [] });
  } catch (err) {
    console.error('Erreur juge-pointages-station:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
