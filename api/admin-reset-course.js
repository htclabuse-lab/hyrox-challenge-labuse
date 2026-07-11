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

    const supabase = createClient(
      'https://mzyfnmjzlosranptwucr.supabase.co',
      process.env.SUPABASE_SERVICE_KEY
    );

    // 1) DELETE tous les Pointages
    const { error: delErr, count: delCount } = await supabase
      .from('Pointages')
      .delete({ count: 'exact' })
      .not('id', 'is', null);
    if (delErr) {
      console.error('Erreur delete Pointages:', delErr);
      return res.status(500).json({ error: 'Erreur delete Pointages: ' + delErr.message });
    }

    // 2) UPDATE Inscriptions : heure_debut_reelle=null, temps_final_s=null
    //    Uniquement pour l'event du 12 juillet
    const { error: updErr, count: updCount } = await supabase
      .from('Inscriptions')
      .update({ heure_debut_reelle: null, temps_final_s: null }, { count: 'exact' })
      .gte('heure_depart', '2026-07-12')
      .lt('heure_depart', '2026-07-13');
    if (updErr) {
      console.error('Erreur update Inscriptions:', updErr);
      return res.status(500).json({ error: 'Erreur update Inscriptions: ' + updErr.message });
    }

    return res.status(200).json({
      success: true,
      pointages_supprimes: delCount || 0,
      inscriptions_reset: updCount || 0
    });
  } catch (err) {
    console.error('Erreur admin-reset-course:', err);
    return res.status(500).json({ error: 'Erreur serveur: ' + err.message });
  }
}
