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

    const { data, error } = await supabase
      .from('Inscriptions')
      .select('vague, heure_depart')
      .not('vague', 'is', null);

    if (error) {
      console.error('Erreur Supabase juge-vagues:', error);
      return res.status(500).json({ error: 'Erreur base de données' });
    }

    const map = {};
    for (const row of data || []) {
      const v = row.vague;
      if (!map[v]) map[v] = { count: 0, heure_depart: null };
      map[v].count++;
      if (row.heure_depart) {
        if (!map[v].heure_depart || row.heure_depart < map[v].heure_depart) {
          map[v].heure_depart = row.heure_depart;
        }
      }
    }

    const vagues = Object.entries(map)
      .map(([numero, info]) => ({
        numero: parseInt(numero, 10),
        athletes_count: info.count,
        heure_depart: info.heure_depart,
      }))
      .sort((a, b) => a.numero - b.numero);

    return res.status(200).json({ vagues });
  } catch (err) {
    console.error('Erreur juge-vagues:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
