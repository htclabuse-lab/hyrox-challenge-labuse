import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  try {
    const { password, inscription_id, station, timestamp_pointage } = req.body || {};
    if (!password || password !== process.env.JUGES_PASSWORD) return res.status(401).json({ error: 'Non autorisé' });
    if (!Number.isInteger(inscription_id) || inscription_id <= 0) return res.status(400).json({ error: 'inscription_id invalide' });
    if (!Number.isInteger(station) || station < 1 || station > 8) return res.status(400).json({ error: 'station invalide' });
    if (!timestamp_pointage || isNaN(Date.parse(timestamp_pointage))) return res.status(400).json({ error: 'timestamp_pointage invalide (ISO)' });

    const supabase = createClient('https://mzyfnmjzlosranptwucr.supabase.co', process.env.SUPABASE_SERVICE_KEY);
    const { data, error } = await supabase
      .from('Pointages')
      .update({ timestamp_pointage })
      .eq('inscription_id', inscription_id)
      .eq('station', station)
      .select().single();
    if (error) return res.status(500).json({ error: 'Erreur update: ' + error.message });
    return res.status(200).json({ success: true, pointage: data });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur: ' + err.message });
  }
}
