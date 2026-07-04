import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { password, inscription_id, station, penalite_30s, penalite_5min, juge_nom } = req.body || {};

    if (!password || password !== process.env.JUGES_PASSWORD) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    if (!Number.isInteger(inscription_id) || inscription_id <= 0) {
      return res.status(400).json({ error: 'inscription_id invalide' });
    }

    if (!Number.isInteger(station) || station < 1 || station > 8) {
      return res.status(400).json({ error: 'station doit être un entier entre 1 et 8' });
    }

    const pen30 = Number.isInteger(penalite_30s) ? penalite_30s : 0;
    const pen5 = Number.isInteger(penalite_5min) ? penalite_5min : 0;

    if (pen30 < 0 || pen5 < 0) {
      return res.status(400).json({ error: 'Les pénalités doivent être supérieures ou égales à 0' });
    }

    if (pen5 > 0 && station !== 1 && station !== 2) {
      return res.status(400).json({ error: 'penalite_5min n\'est autorisée que sur les stations 1 et 2' });
    }

    const supabaseUrl = 'https://mzyfnmjzlosranptwucr.supabase.co';
    const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY);

    const insertData = {
      inscription_id,
      station,
      penalite_30s: pen30,
      penalite_5min: pen5,
    };
    if (typeof juge_nom === 'string' && juge_nom.trim()) {
      insertData.juge_nom = juge_nom.trim();
    }

    const { data, error } = await supabase
      .from('Pointages')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Cet athlète a déjà été pointé sur cette station' });
      }
      if (error.code === '23503') {
        return res.status(404).json({ error: 'Athlète introuvable (inscription_id inconnu)' });
      }
      console.error('Erreur Supabase juge-pointage:', error);
      return res.status(500).json({ error: 'Erreur base de données' });
    }

    // Si c'est la station 8 → déclenche juge-finish (calcul temps + mail bravo)
    let finish = null;
    if (station === 8) {
      try {
        const proto = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const finishUrl = `${proto}://${host}/api/juge-finish`;
        const r = await fetch(finishUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, inscription_id }),
        });
        finish = await r.json().catch(() => ({}));
      } catch (e) {
        console.error('Erreur trigger juge-finish:', e);
        finish = { error: 'trigger_failed' };
      }
    }

    return res.status(200).json({ success: true, pointage: data, finish });
  } catch (err) {
    console.error('Erreur juge-pointage:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
