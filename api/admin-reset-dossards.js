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

    const { count: pointagesBefore } = await supabase
      .from('Pointages')
      .select('id', { count: 'exact', head: true });

    const { error: delErr } = await supabase
      .from('Pointages')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (delErr) {
      console.error('Erreur DELETE Pointages:', delErr);
      return res.status(500).json({ error: 'Erreur suppression pointages' });
    }

    const { data: updated, error: updErr } = await supabase
      .from('Inscriptions')
      .update({ dossard: null, vague: null, heure_depart: null })
      .gt('id', 0)
      .select('id');

    if (updErr) {
      console.error('Erreur UPDATE Inscriptions:', updErr);
      return res.status(500).json({ error: 'Erreur réinitialisation inscriptions' });
    }

    return res.status(200).json({
      success: true,
      pointages_deleted: pointagesBefore || 0,
      inscriptions_reset: updated ? updated.length : 0,
    });
  } catch (err) {
    console.error('Erreur admin-reset-dossards:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
