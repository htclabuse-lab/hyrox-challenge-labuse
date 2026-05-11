import { createClient } from '@supabase/supabase-js';

const CAT_ORDER = [
  'duo scaled hommes', 'duo rx homme', 'solo scaled hommes', 'solo rx hommes',
  'duo scaled mixte', 'duo rx mixte',
  'duo scaled femmes', 'duo rx femme',
  'solo scaled femmes', 'solo rx femmes',
  'relais'
];

function getCatKey(categorie) {
  if (!categorie) return '';
  const c = categorie.toLowerCase();
  if (c.includes('relais')) return 'relais';
  if (c.includes('duo') && c.includes('scaled') && (c.includes('femme') || c.includes('féminin'))) return 'duo scaled femmes';
  if (c.includes('duo') && c.includes('scaled') && (c.includes('homme') || c.includes('masculin')) && !c.includes('mixte')) return 'duo scaled hommes';
  if (c.includes('duo') && c.includes('scaled') && c.includes('mixte')) return 'duo scaled mixte';
  if (c.includes('duo') && c.includes('rx') && (c.includes('femme') || c.includes('féminin')) && !c.includes('mixte')) return 'duo rx femme';
  if (c.includes('duo') && c.includes('rx') && (c.includes('homme') || c.includes('masculin')) && !c.includes('mixte')) return 'duo rx homme';
  if (c.includes('duo') && c.includes('rx') && c.includes('mixte')) return 'duo rx mixte';
  if (c.includes('solo') && c.includes('scaled') && (c.includes('femme') || c.includes('féminin'))) return 'solo scaled femmes';
  if (c.includes('solo') && c.includes('scaled') && (c.includes('homme') || c.includes('masculin'))) return 'solo scaled hommes';
  if (c.includes('solo') && c.includes('rx') && (c.includes('femme') || c.includes('féminin'))) return 'solo rx femmes';
  if (c.includes('solo') && c.includes('rx') && (c.includes('homme') || c.includes('masculin'))) return 'solo rx hommes';
  return c;
}

function getTempsOrder(temps) {
  if (!temps) return 99;
  const t = String(temps).toLowerCase();
  if (t.includes('moins')) return 1;
  if (t.includes('1h et 1h10')) return 2;
  if (t.includes('1h10 et 1h20')) return 3;
  if (t.includes('1h20 et 1h30')) return 4;
  if (t.includes('1h30 et 1h40')) return 5;
  if (t.includes('1h40') || t.includes('plus')) return 6;
  return 99;
}

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

    const { count: pointagesCount, error: countErr } = await supabase
      .from('Pointages')
      .select('id', { count: 'exact', head: true });

    if (countErr) {
      console.error('Erreur count Pointages:', countErr);
      return res.status(500).json({ error: 'Erreur lecture pointages' });
    }

    const { data: anyHeureDepart, error: hdErr } = await supabase
      .from('Inscriptions')
      .select('id')
      .not('heure_depart', 'is', null)
      .limit(1);

    if (hdErr) {
      console.error('Erreur check heure_depart:', hdErr);
      return res.status(500).json({ error: 'Erreur lecture inscriptions' });
    }

    if ((pointagesCount && pointagesCount > 0) || (anyHeureDepart && anyHeureDepart.length > 0)) {
      return res.status(409).json({
        error: 'Des athlètes ont déjà démarré ou ont des pointages. Réinitialise d\'abord.',
      });
    }

    const { data: inscriptions, error: fetchErr } = await supabase
      .from('Inscriptions')
      .select('id, categorie, temps_estime');

    if (fetchErr) {
      console.error('Erreur fetch Inscriptions:', fetchErr);
      return res.status(500).json({ error: 'Erreur lecture inscriptions' });
    }

    const groups = {};
    const skipped = [];
    for (const d of inscriptions || []) {
      const key = getCatKey(d.categorie);
      if (!CAT_ORDER.includes(key)) {
        skipped.push({ id: d.id, categorie: d.categorie });
        continue;
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    }

    for (const key of CAT_ORDER) {
      if (groups[key]) {
        groups[key].sort((a, b) => getTempsOrder(a.temps_estime) - getTempsOrder(b.temps_estime));
      }
    }

    const flat = [];
    for (const key of CAT_ORDER) {
      if (groups[key] && groups[key].length > 0) {
        flat.push(...groups[key]);
      }
    }

    let dossard = 1;
    let vague = 1;
    const assignments = [];
    for (let i = 0; i < flat.length; i += 4) {
      const groupe = flat.slice(i, i + 4);
      for (const d of groupe) {
        assignments.push({ id: d.id, dossard, vague });
        dossard++;
      }
      vague++;
    }

    const BATCH_SIZE = 20;
    for (let i = 0; i < assignments.length; i += BATCH_SIZE) {
      const batch = assignments.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(a =>
          supabase
            .from('Inscriptions')
            .update({ dossard: a.dossard, vague: a.vague })
            .eq('id', a.id)
        )
      );
      const failed = results.find(r => r.error);
      if (failed) {
        console.error('Erreur batch update:', failed.error);
        return res.status(500).json({ error: 'Erreur écriture dossards/vagues. Lance Réinitialiser puis recommence.' });
      }
    }

    return res.status(200).json({
      success: true,
      athletes_assigned: assignments.length,
      vagues_count: vague - 1,
      skipped_count: skipped.length,
      skipped_examples: skipped.slice(0, 5),
    });
  } catch (err) {
    console.error('Erreur admin-seed-test:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
