import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { password, updates, dry_run } = req.body || {};

    if (!password || password !== process.env.JUGES_PASSWORD) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'updates (array) requis' });
    }

    for (let i = 0; i < updates.length; i++) {
      const u = updates[i];
      if (!u || !Number.isInteger(u.id) || u.id <= 0) {
        return res.status(400).json({ error: `updates[${i}].id invalide` });
      }
      if (!Number.isInteger(u.vague) || u.vague < 1 || u.vague > 200) {
        return res.status(400).json({ error: `updates[${i}].vague invalide` });
      }
      if (typeof u.heure_depart !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\+|-)\d{2}:\d{2}$/.test(u.heure_depart)) {
        return res.status(400).json({ error: `updates[${i}].heure_depart invalide (attendu ISO YYYY-MM-DDTHH:MM:SS+HH:MM)` });
      }
    }

    if (dry_run === true) {
      return res.status(200).json({
        success: true,
        dry_run: true,
        count: updates.length,
        preview_first: updates.slice(0, 3),
        preview_last: updates.slice(-3),
      });
    }

    const supabase = createClient(
      'https://mzyfnmjzlosranptwucr.supabase.co',
      process.env.SUPABASE_SERVICE_KEY
    );

    const results = { updated: [], failed: [] };
    for (const u of updates) {
      const { data, error } = await supabase
        .from('Inscriptions')
        .update({ vague: u.vague, heure_depart: u.heure_depart })
        .eq('id', u.id)
        .select('id');
      if (error || !data || data.length === 0) {
        results.failed.push({ id: u.id, error: error ? error.message : 'not_found' });
      } else {
        results.updated.push(u.id);
      }
    }

    return res.status(200).json({
      success: results.failed.length === 0,
      total: updates.length,
      updated_count: results.updated.length,
      failed_count: results.failed.length,
      failed: results.failed,
    });
  } catch (err) {
    console.error('Erreur admin-set-vagues:', err);
    return res.status(500).json({ error: 'Erreur serveur: ' + err.message });
  }
}
