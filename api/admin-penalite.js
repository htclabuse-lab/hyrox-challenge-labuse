import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { password, inscription_id, station, add_30s, add_5min } = req.body || {};
    if (!password || password !== process.env.JUGES_PASSWORD) {
      return res.status(401).json({ error: 'Non autorisé' });
    }
    if (!Number.isInteger(inscription_id) || inscription_id <= 0) {
      return res.status(400).json({ error: 'inscription_id invalide' });
    }
    if (!Number.isInteger(station) || station < 1 || station > 8) {
      return res.status(400).json({ error: 'station invalide (1-8)' });
    }
    const d30 = Number.isInteger(add_30s) ? add_30s : 0;
    const d5 = Number.isInteger(add_5min) ? add_5min : 0;

    const supabase = createClient(
      'https://mzyfnmjzlosranptwucr.supabase.co',
      process.env.SUPABASE_SERVICE_KEY
    );

    // Fetch existing pointage
    const { data: point, error: pErr } = await supabase
      .from('Pointages')
      .select('*')
      .eq('inscription_id', inscription_id)
      .eq('station', station)
      .single();
    if (pErr || !point) return res.status(404).json({ error: 'Pointage introuvable' });

    const newP30 = Math.max(0, (point.penalite_30s || 0) + d30);
    const newP5 = Math.max(0, (point.penalite_5min || 0) + d5);

    const { data: upd, error: uErr } = await supabase
      .from('Pointages')
      .update({ penalite_30s: newP30, penalite_5min: newP5 })
      .eq('id', point.id)
      .select('*')
      .single();
    if (uErr) return res.status(500).json({ error: 'Erreur update: ' + uErr.message });

    return res.status(200).json({ success: true, pointage: upd });
  } catch (err) {
    console.error('Erreur admin-penalite:', err);
    return res.status(500).json({ error: 'Erreur serveur: ' + err.message });
  }
}
