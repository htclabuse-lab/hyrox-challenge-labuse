import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL, CATEGORIE_INSCRIPTION, FORMULE_CARNET, PLACES_PAR_GROUPE, GROUPES,
  emailValide, groupeParAge,
} from '../lib/kids.js';

// ============================================================================
// Réservation d'une séance pour les enfants au CARNET (page kids-reservation.html).
//
// Pourquoi : un abonné paie le mois et vient quand il veut, il est donc compté
// d'office dans l'effectif de son groupe. Un carnet ne réserve pas de place à
// l'année : l'enfant se glisse dans les places restantes, samedi par samedi.
//
//  POST { action: 'lookup', email, enfant_prenom }
//      → la ou les fiches carnet de cette famille + les 8 prochains samedis
//        avec les places restantes et l'état de réservation.
//  POST { action: 'book',   id, date }  → réserve (décompte 1 séance).
//  POST { action: 'cancel', id, date }  → annule (rend la séance) jusqu'au
//        vendredi soir qui précède.
//  POST { action: 'admin',  password, date } → la liste des carnets attendus
//        ce samedi-là (utilisé par admin.html).
//
// La table Reservations_kids a RLS activée sans aucune policy : elle n'est
// accessible que par la service_role, donc uniquement via cette route.
// ============================================================================

const TABLE = 'Reservations_kids';
const NB_SAMEDIS = 8;

function iso(d) { return d.toISOString().slice(0, 10); }

// Les NB_SAMEDIS prochains samedis, à partir d'aujourd'hui inclus.
function prochainsSamedis() {
  const out = [];
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < NB_SAMEDIS; i++) {
    out.push(iso(d));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

// Annulation possible jusqu'au vendredi 20h (heure de La Réunion, UTC+4) qui précède.
function annulationPossible(dateSeance) {
  const limite = new Date(dateSeance + 'T16:00:00Z'); // vendredi 20h La Réunion
  limite.setUTCDate(limite.getUTCDate() - 1);
  return Date.now() < limite.getTime();
}

function groupeDe(r) {
  return (r.groupe === 'petits' || r.groupe === 'grands') ? r.groupe : groupeParAge(r.co1_date_naissance);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) return res.status(500).json({ error: 'Configuration serveur incomplète' });
  const db = createClient(SUPABASE_URL, serviceKey);
  const b = req.body || {};

  try {
    // Toutes les fiches payées : les abonnés occupent une place d'office.
    const { data: payes, error: e1 } = await db.from('Inscriptions')
      .select('id,co1_prenom,co1_nom,co1_date_naissance,prenom,nom,email,telephone,groupe,nom_equipe,seances_restantes,statut_paiement')
      .eq('categorie', CATEGORIE_INSCRIPTION).eq('statut_paiement', 'payé');
    if (e1) return res.status(500).json({ error: e1.message });

    const abonnesParGroupe = {};
    for (const k of Object.keys(GROUPES)) {
      abonnesParGroupe[k] = payes.filter(r => r.nom_equipe !== FORMULE_CARNET && groupeDe(r) === k).length;
    }

    const samedis = prochainsSamedis();
    const { data: resas, error: e2 } = await db.from(TABLE)
      .select('id,inscription_id,date_seance').in('date_seance', samedis);
    if (e2) return res.status(500).json({ error: e2.message });

    const carnetDe = {};
    payes.filter(r => r.nom_equipe === FORMULE_CARNET).forEach(r => { carnetDe[r.id] = r; });

    // Places restantes par samedi et par groupe.
    function restantes(date, groupe) {
      const n = resas.filter(x => x.date_seance === date && carnetDe[x.inscription_id] && groupeDe(carnetDe[x.inscription_id]) === groupe).length;
      return Math.max(0, PLACES_PAR_GROUPE - abonnesParGroupe[groupe] - n);
    }

    // ---------------------------------------------------------------- admin
    if (b.action === 'admin') {
      if (!b.password || b.password !== process.env.JUGES_PASSWORD) return res.status(401).json({ error: 'Non autorisé' });
      const parDate = {};
      for (const d of samedis) {
        parDate[d] = resas.filter(x => x.date_seance === d && carnetDe[x.inscription_id]).map(x => {
          const r = carnetDe[x.inscription_id];
          return { id: r.id, enfant: `${(r.co1_prenom || '').trim()} ${(r.co1_nom || '').trim()}`.trim(),
                   groupe: groupeDe(r), seances_restantes: r.seances_restantes, telephone: r.telephone };
        });
      }
      return res.status(200).json({ samedis, reservations: parDate });
    }

    // --------------------------------------------------------------- lookup
    if (b.action === 'lookup') {
      const email = String(b.email || '').trim().toLowerCase();
      const prenom = String(b.enfant_prenom || '').trim().toLowerCase();
      if (!emailValide(email) || !prenom) return res.status(400).json({ error: "Indique l'email de l'inscription et le prénom de l'enfant." });
      const fiches = Object.values(carnetDe).filter(r =>
        String(r.email || '').trim().toLowerCase() === email &&
        String(r.co1_prenom || '').trim().toLowerCase() === prenom);
      if (!fiches.length) {
        return res.status(404).json({ error: "Aucun carnet trouvé pour cet email et ce prénom. Vérifie l'orthographe, ou écris-nous à htclabuse@gmail.com." });
      }
      const out = fiches.map(r => {
        const g = groupeDe(r);
        return {
          id: r.id,
          enfant: (r.co1_prenom || '').trim(),
          groupe: g, groupe_label: GROUPES[g].label, horaire: GROUPES[g].horaire,
          seances_restantes: r.seances_restantes || 0,
          samedis: samedis.map(d => ({
            date: d,
            places_restantes: restantes(d, g),
            reserve: resas.some(x => x.date_seance === d && x.inscription_id === r.id),
            annulable: annulationPossible(d),
          })),
        };
      });
      return res.status(200).json({ fiches: out });
    }

    // ----------------------------------------------------------------- book
    const id = parseInt(b.id, 10);
    const date = String(b.date || '');
    if (!id || !samedis.includes(date)) return res.status(400).json({ error: 'Séance invalide.' });
    const fiche = carnetDe[id];
    if (!fiche) return res.status(404).json({ error: 'Carnet introuvable.' });
    const g = groupeDe(fiche);
    const dejaResa = resas.some(x => x.date_seance === date && x.inscription_id === id);

    if (b.action === 'book') {
      if (dejaResa) return res.status(409).json({ error: 'Cette séance est déjà réservée.' });
      if ((fiche.seances_restantes || 0) <= 0) return res.status(409).json({ error: "Il ne reste plus de séance sur ce carnet. Écris-nous pour le renouveler." });
      if (restantes(date, g) <= 0) return res.status(409).json({ error: 'Ce samedi est complet sur ce créneau. Choisis une autre date.' });
      const { error } = await db.from(TABLE).insert({ inscription_id: id, date_seance: date });
      if (error) return res.status(500).json({ error: error.message });
      await db.from('Inscriptions').update({ seances_restantes: (fiche.seances_restantes || 0) - 1 }).eq('id', id);
      return res.status(200).json({ success: true, date, seances_restantes: (fiche.seances_restantes || 0) - 1 });
    }

    if (b.action === 'cancel') {
      if (!dejaResa) return res.status(409).json({ error: 'Cette séance n\'est pas réservée.' });
      if (!annulationPossible(date)) return res.status(409).json({ error: "Trop tard pour annuler (jusqu'au vendredi 20h). La séance reste décomptée." });
      const { error } = await db.from(TABLE).delete().eq('inscription_id', id).eq('date_seance', date);
      if (error) return res.status(500).json({ error: error.message });
      await db.from('Inscriptions').update({ seances_restantes: (fiche.seances_restantes || 0) + 1 }).eq('id', id);
      return res.status(200).json({ success: true, date, seances_restantes: (fiche.seances_restantes || 0) + 1 });
    }

    return res.status(400).json({ error: 'Action inconnue.' });
  } catch (e) {
    console.error('kids-reservation', e);
    return res.status(500).json({ error: e.message });
  }
}
