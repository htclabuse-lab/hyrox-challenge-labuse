import { createClient } from '@supabase/supabase-js';

const STATIONS = {
  1: 'SkiErg', 2: 'Sled Push', 3: 'Sled Pull', 4: 'Burpee Broad Jump',
  5: 'Rowing', 6: 'Farmers Carry', 7: 'Sandbag Lunges', 8: 'Wall Balls'
};

function formatHMS(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

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

function ageBucket(dobs) {
  const valid = (dobs || []).filter(Boolean);
  if (valid.length === 0) return '';
  const ages = valid.map(d => 2026 - parseInt(String(d).split('-')[0], 10)).filter(n => Number.isFinite(n));
  if (ages.length === 0) return '';
  const moy = Math.round(ages.reduce((a, b) => a + b, 0) / ages.length);
  if (moy <= 24) return '16-24';
  if (moy <= 34) return '25-34';
  if (moy <= 44) return '35-44';
  if (moy <= 54) return '45-54';
  return '55+';
}

function fmtName(nom, prenom) {
  return `${String(nom || '').toUpperCase()} ${String(prenom || '').trim()}`.trim();
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    // Event 2 débloqué publiquement

    const supabaseUrl = 'https://mzyfnmjzlosranptwucr.supabase.co';
    const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY);

    const { data: inscriptions, error: insErr } = await supabase
      .from('Inscriptions')
      .select('id, dossard, nom, prenom, nom_equipe, categorie, heure_depart, temps_final_s, date_naissance, co1_nom, co1_prenom, co1_date_naissance, co2_nom, co2_prenom, co2_date_naissance, co3_nom, co3_prenom, co3_date_naissance')
      .not('heure_depart', 'is', null);

    if (insErr) {
      console.error('Erreur fetch Inscriptions:', insErr);
      return res.status(500).json({ error: 'Erreur base de données' });
    }

    // Pagination pour lever la limite par défaut de 1000
    const pointages = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data: page, error: ptErr } = await supabase
        .from('Pointages')
        .select('inscription_id, station, timestamp_pointage, penalite_30s, penalite_5min')
        .range(from, from + pageSize - 1);
      if (ptErr) {
        console.error('Erreur fetch Pointages:', ptErr);
        return res.status(500).json({ error: 'Erreur base de données' });
      }
      if (!page || page.length === 0) break;
      pointages.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    const ptByIns = {};
    for (const p of pointages || []) {
      if (!ptByIns[p.inscription_id]) ptByIns[p.inscription_id] = [];
      ptByIns[p.inscription_id].push(p);
    }

    const resultats = [];
    for (const ins of inscriptions || []) {
      const myPts = (ptByIns[ins.id] || []).sort((a, b) => a.station - b.station);
      const finished = myPts.length === 8 && myPts.every((p, i) => p.station === i + 1);
      if (!finished) continue;

      const heureDepart = new Date(ins.heure_depart).getTime();
      const station8Time = new Date(myPts[7].timestamp_pointage).getTime();
      const brutSec = Math.floor((station8Time - heureDepart) / 1000);
      const totalPen30 = myPts.reduce((s, p) => s + (p.penalite_30s || 0), 0);
      const totalPen5 = myPts.reduce((s, p) => s + (p.penalite_5min || 0), 0);
      const penSec = totalPen30 * 30 + totalPen5 * 300;
      // Priorité au temps final manuel (temps_final_s en BDD) si présent
      const totalSec = (typeof ins.temps_final_s === 'number' && ins.temps_final_s > 0)
        ? ins.temps_final_s
        : brutSec + penSec;

      const splits = [];
      let prevTime = heureDepart;
      for (const p of myPts) {
        const ptTime = new Date(p.timestamp_pointage).getTime();
        splits.push({
          station: p.station,
          label: STATIONS[p.station],
          split: formatHMS(Math.floor((ptTime - prevTime) / 1000)),
          cumul: formatHMS(Math.floor((ptTime - heureDepart) / 1000)),
          penalite_30s: p.penalite_30s || 0,
          penalite_5min: p.penalite_5min || 0,
        });
        prevTime = ptTime;
      }

      const isSolo = !ins.nom_equipe || String(ins.nom_equipe).trim() === '';
      let nom, membres;
      if (isSolo) {
        nom = fmtName(ins.nom, ins.prenom);
        membres = '';
      } else {
        nom = ins.nom_equipe;
        const team = [];
        if (ins.nom || ins.prenom) team.push(fmtName(ins.nom, ins.prenom));
        if (ins.co1_nom || ins.co1_prenom) team.push(fmtName(ins.co1_nom, ins.co1_prenom));
        if (ins.co2_nom || ins.co2_prenom) team.push(fmtName(ins.co2_nom, ins.co2_prenom));
        if (ins.co3_nom || ins.co3_prenom) team.push(fmtName(ins.co3_nom, ins.co3_prenom));
        membres = team.join(' / ');
      }

      resultats.push({
        nom,
        membres,
        cat: getCatKey(ins.categorie),
        age: ageBucket([ins.date_naissance, ins.co1_date_naissance, ins.co2_date_naissance, ins.co3_date_naissance]),
        temps: formatHMS(totalSec),
        solo: isSolo,
        dossard: ins.dossard,
        brut_sec: brutSec,
        total_sec: totalSec,
        penalite_30s: totalPen30,
        penalite_5min: totalPen5,
        splits,
      });
    }

    return res.status(200).json({
      event: {
        id: 2,
        nom: 'Hyrox Challenge La Buse #2',
        date: '2026-07-12',
        lieu: 'Saint-Paul, La Réunion',
        in_progress: true,
      },
      resultats,
    });
  } catch (err) {
    console.error('Erreur event2-resultats:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
