import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  try {
    const { password, inscription_id, station, timestamp_pointage, penalite_s } = req.body || {};
    if (!password || password !== process.env.JUGES_PASSWORD) return res.status(401).json({ error: 'Non autorisé' });
    if (!Number.isInteger(inscription_id) || inscription_id <= 0) return res.status(400).json({ error: 'inscription_id invalide' });
    if (!Number.isInteger(station) || station < 1 || station > 8) return res.status(400).json({ error: 'station invalide' });
    const champs = {};
    if (timestamp_pointage !== undefined) {
      if (!timestamp_pointage || isNaN(Date.parse(timestamp_pointage))) return res.status(400).json({ error: 'timestamp_pointage invalide (ISO)' });
      champs.timestamp_pointage = timestamp_pointage;
    }
    if (penalite_s !== undefined) {
      if (!Number.isInteger(penalite_s) || penalite_s < 0) return res.status(400).json({ error: 'penalite_s doit être un entier >= 0' });
      champs.penalite_s = penalite_s;
    }
    if (!Object.keys(champs).length) return res.status(400).json({ error: 'Rien à modifier (timestamp_pointage ou penalite_s requis)' });

    const supabase = createClient('https://mzyfnmjzlosranptwucr.supabase.co', process.env.SUPABASE_SERVICE_KEY);
    const { data, error } = await supabase
      .from('Pointages')
      .update(champs)
      .eq('inscription_id', inscription_id)
      .eq('station', station)
      .select().single();
    if (error) return res.status(500).json({ error: 'Erreur update: ' + error.message });
    return res.status(200).json({ success: true, pointage: data });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur: ' + err.message });
  }
}
