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
      .select('vague')
      .not('vague', 'is', null)
      .is('heure_depart', null);

    if (error) {
      console.error('Erreur Supabase juge-vagues:', error);
      return res.status(500).json({ error: 'Erreur base de données' });
    }

    const counts = {};
    for (const row of data || []) {
      counts[row.vague] = (counts[row.vague] || 0) + 1;
    }

    const vagues = Object.entries(counts)
      .map(([numero, athletes_count]) => ({ numero: parseInt(numero, 10), athletes_count }))
      .sort((a, b) => a.numero - b.numero);

    return res.status(200).json({ vagues });
  } catch (err) {
    console.error('Erreur juge-vagues:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
