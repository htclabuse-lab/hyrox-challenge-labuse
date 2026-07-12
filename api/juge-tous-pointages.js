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
    const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY);

    // Pagination pour lever la limite par défaut de 1000
    const pageSize = 1000;
    let allData = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('Pointages')
        .select('id, inscription_id, station, timestamp_pointage, penalite_30s, penalite_5min')
        .order('timestamp_pointage', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) {
        console.error('Erreur Supabase juge-tous-pointages:', error);
        return res.status(500).json({ error: 'Erreur base de données' });
      }
      allData = allData.concat(data || []);
      if (!data || data.length < pageSize) break;
      from += pageSize;
      if (from > 20000) break; // safety
    }
    const data = allData;
    const error = null;

    if (error) {
      console.error('Erreur Supabase juge-tous-pointages:', error);
      return res.status(500).json({ error: 'Erreur base de données' });
    }

    return res.status(200).json({ pointages: data || [] });
  } catch (err) {
    console.error('Erreur juge-tous-pointages:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
