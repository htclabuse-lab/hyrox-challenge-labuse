import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../lib/kids.js';

// ============================================================================
// Mail « tes photos sont en ligne » aux inscrits payés de PE #2 et HC #3 (20/11/2026).
// Un mail par événement, dédoublonné par email (inscrit principal + co1).
// Mêmes inscrits que ceux reconnus par photos.html (created_at >= inscriptions_depuis,
// payés, Parent-Enfant d'un côté / hors Parent-Enfant et Kids de l'autre).
//
//  POST { password, dry_run: true }        → nombre de destinataires par événement (rien n'est envoyé)
//  POST { password, test_to: 'x@y.fr' }   → les 2 versions (PE + HC) à cette seule adresse
//  POST { password, envoyer: true }        → envoi réel à tous (clés d'idempotence : pas de double envoi)
//
// Protégé par PHOTOS_ADMIN_PASSWORD.
// ============================================================================

const FROM = 'Hyrox Challenge La Buse <noreply@htclabuse.fr>';
const REPLY_TO = 'htclabuse@gmail.com';
const PAGE_PHOTOS = id => `https://hyrox-challenge-labuse.vercel.app/photos.html?evt=${id}`;
const EVENEMENTS = ['pe2', 'hc3'];

const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function mailPhotos(evtId, prenom) {
  const pe = evtId === 'pe2';
  const salut = prenom ? `Salut <strong>${esc(prenom)}</strong> !` : 'Salut à toi !';
  return {
    subject: pe ? '📸 Vos photos du Hyrox Parents / Enfants #2 sont en ligne !'
                : '📸 Tes photos du Hyrox Challenge La Buse #3 sont en ligne !',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + `<p>${salut}</p>`
      + (pe ? '<p>Les photos du <strong>Hyrox Parents / Enfants #2</strong> sont en ligne 👨‍👧</p>'
            : '<p>Les photos du <strong>Hyrox Challenge La Buse #3</strong> sont en ligne 🔥</p>')
      + `<p>👉 <strong>Retrouve tes photos ici :</strong><br><a href="${PAGE_PHOTOS(evtId)}">${PAGE_PHOTOS(evtId)}</a></p>`
      + '<p><strong>Comment ça marche :</strong></p>'
      + '<ol style="padding-left:20px;margin:0 0 14px;">'
      + '<li style="margin-bottom:6px;">Entre <strong>l\'email de ton inscription</strong> (celui sur lequel tu reçois ce mail).</li>'
      + '<li style="margin-bottom:6px;">Parcours toutes les photos de l\'événement. Tu peux aussi faire un <strong>selfie</strong> pour qu\'on t\'aide à retrouver les tiennes : ton selfie reste sur ton téléphone, il n\'est ni envoyé ni enregistré.</li>'
      + '<li>Choisis tes photos :<br>'
      + '🎁 <strong>3 photos offertes par équipe</strong> (pour toute l\'équipe, pas 3 chacun) ;<br>'
      + '🔓 <strong>Pack photo à 20 €</strong> pour toute l\'équipe : tes photos en HD, sans filigrane.</li>'
      + '</ol>'
      + '<p>Tu as déjà pris le pack photo ? Entre simplement ton email et sélectionne tes photos.</p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:12px 16px;margin:14px 0;border-radius:4px;">'
      + '⚠️ La reconnaissance par selfie n\'est pas parfaite : pense à parcourir toutes les photos pour ne rien rater !'
      + '</div>'
      + '<p>Merci encore d\'avoir été là, et à très vite 💛🖤</p>'
      + '<p><strong>Hyrox Training Club La Buse — Maryan, Romuald et Stéphanie</strong></p>'
      + '</div>',
  };
}

// Mail aux BÉNÉVOLES (galerie + 3 photos offertes, pas de pack), selon leur jour.
function mailBenevole(evtId, prenom) {
  const pe = evtId === 'pe2';
  const salut = prenom ? `Salut <strong>${esc(prenom)}</strong> !` : 'Salut à toi !';
  const nom = pe ? 'Hyrox Parents / Enfants #2' : 'Hyrox Challenge La Buse #3';
  return {
    subject: `📸 Merci bénévole ! Tes photos du ${nom}`,
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + `<p>${salut}</p>`
      + `<p>Encore un immense merci pour ton aide ${pe ? 'samedi' : 'dimanche'} sur le <strong>${nom}</strong> 💛🖤</p>`
      + '<p>Pour te remercier, tu as accès à la galerie photos de l\'événement 🎁</p>'
      + `<p>👉 <strong>Retrouve tes photos ici :</strong><br><a href="${PAGE_PHOTOS(evtId)}">${PAGE_PHOTOS(evtId)}</a></p>`
      + '<p><strong>Comment ça marche :</strong></p>'
      + '<ol style="padding-left:20px;margin:0 0 14px;">'
      + '<li style="margin-bottom:6px;">Entre <strong>l\'email de ton inscription bénévole</strong> (celui sur lequel tu reçois ce mail).</li>'
      + '<li style="margin-bottom:6px;">Parcours toutes les photos de l\'événement. Tu peux aussi faire un <strong>selfie</strong> pour qu\'on t\'aide à retrouver les tiennes : ton selfie reste sur ton téléphone, il n\'est ni envoyé ni enregistré.</li>'
      + '<li>Choisis tes <strong>photos offertes</strong>, puis appuie sur le bouton jaune en bas de l\'écran. Attention, le choix est définitif !</li>'
      + '</ol>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:12px 16px;margin:14px 0;border-radius:4px;">'
      + '⚠️ La reconnaissance par selfie n\'est pas parfaite : pense à parcourir toutes les photos pour ne rien rater !'
      + '</div>'
      + '<p>Merci encore, et à très vite 💛🖤</p>'
      + '<p><strong>Hyrox Training Club La Buse — Maryan, Romuald et Stéphanie</strong></p>'
      + '</div>',
  };
}

// Bénévoles du jour (samedi → PE, dimanche → HC), hors fiches exclues, hors athlètes de l'événement
// (ceux-là ont déjà reçu le mail athlètes et gardent leur accès d'athlète).
const BENEVOLES_EXCLUS_IDS = [41, 42];
async function destinatairesBenevoles(db, evtId, athletes) {
  const { data: evt, error: e1 } = await db.from('photos_evenements').select('id,type').eq('id', evtId).single();
  if (e1) throw e1;
  const { data, error } = await db.from('Benevoles').select('id,prenom,email,disponibilites').gte('created_at', '2026-09-01');
  if (error) throw error;
  const exclusEmails = new Set();
  const { data: ex } = await db.from('Benevoles').select('email').in('id', BENEVOLES_EXCLUS_IDS);
  for (const r of ex || []) exclusEmails.add(String(r.email || '').trim().toLowerCase());
  const dejaAthletes = new Set(athletes.map(a => a.email));
  const parEmail = {};
  for (const r of data || []) {
    const e = String(r.email || '').trim().toLowerCase();
    if (!e.includes('@') || exclusEmails.has(e) || dejaAthletes.has(e) || BENEVOLES_EXCLUS_IDS.includes(r.id)) continue;
    const dispo = String(r.disponibilites || '');
    const ok = evt.type === 'parent_enfant' ? dispo.includes('veille') : /journee|matin|aprem/.test(dispo);
    if (!ok) continue;
    (parEmail[e] = parEmail[e] || []).push(String(r.prenom || '').trim());
  }
  return Object.keys(parEmail).sort().map(e => {
    const prenoms = [...new Set(parEmail[e].filter(Boolean))];
    return { email: e, prenom: prenoms.length === 1 ? prenoms[0] : null };
  });
}

// ---------------------------------------------------------------- Relance pack (21/11/2026)
// 1) équipes avec pack qui n'ont encore RIEN récupéré ;
// 2) équipes qui n'ont pris que très peu de photos (EQUIPES_PEU) : « il reste de la place ».
// Les équipes de test (pack offert pour essayer la page) ne sont pas relancées.
const EQUIPES_TEST = [771, 774, 781, 782];
const EQUIPES_PEU = [484, 590];
const NOM_EVT = { pe2: 'Hyrox Parents / Enfants #2', hc3: 'Hyrox Challenge La Buse #3' };

function mailRelance(evtId, prenom, peu) {
  const salut = prenom ? `Salut <strong>${esc(prenom)}</strong> !` : 'Salut à toi !';
  const intro = peu
    ? `<p>Ton équipe a déjà récupéré quelques photos avec votre <strong>pack photo</strong> du <strong>${NOM_EVT[evtId]}</strong>… mais il reste plein de place 😉</p>`
      + '<p>Chacun de vous peut se connecter avec <strong>son propre email d\'inscription</strong> et choisir ses photos.</p>'
    : `<p>Tu as pris le <strong>pack photo</strong> du <strong>${NOM_EVT[evtId]}</strong>, mais tu n'as pas encore choisi tes photos 📸</p>`;
  return {
    subject: peu ? '📸 Il reste de la place dans ton pack photo !' : '📸 Ton pack photo t\'attend !',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + `<p>${salut}</p>` + intro
      + `<p>👉 <strong>Choisis tes photos ici :</strong><br><a href="${PAGE_PHOTOS(evtId)}">${PAGE_PHOTOS(evtId)}</a></p>`
      + '<ol style="padding-left:20px;margin:0 0 14px;">'
      + '<li style="margin-bottom:6px;">Entre <strong>l\'email de ton inscription</strong> (celui sur lequel tu reçois ce mail).</li>'
      + '<li style="margin-bottom:6px;">Sélectionne tes photos dans la galerie (tu peux t\'aider d\'un selfie), puis appuie sur le <strong>bouton jaune en bas de l\'écran</strong>.</li>'
      + '<li>Tu reçois tes photos en HD, sans filigrane.</li>'
      + '</ol>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:12px 16px;margin:14px 0;border-radius:4px;">'
      + '⚠️ La reconnaissance par selfie n\'est pas parfaite : pense à parcourir toutes les photos pour ne rien rater !'
      + '</div>'
      + '<p>À très vite 💛🖤</p>'
      + '<p><strong>Hyrox Training Club La Buse — Maryan, Romuald et Stéphanie</strong></p>'
      + '</div>',
  };
}

async function destinatairesRelance(db, evtId) {
  const { data: evt, error: e1 } = await db.from('photos_evenements').select('id,type,inscriptions_depuis').eq('id', evtId).single();
  if (e1) throw e1;
  const { data, error } = await db.from('Inscriptions')
    .select('id,prenom,email,co1_prenom,co1_email,categorie,statut_paiement,pack_photo')
    .gte('created_at', evt.inscriptions_depuis);
  if (error) throw error;
  const { data: acces, error: e2 } = await db.from('photos_acces').select('inscription_id,origine,statut,photo_ids').eq('evenement_id', evtId);
  if (e2) throw e2;
  const achetes = new Set(acces.filter(a => a.origine === 'achat_en_ligne' && a.statut === 'actif').map(a => a.inscription_id));
  const servis = new Set(acces.filter(a => a.statut === 'actif' && (a.photo_ids || []).length).map(a => a.inscription_id));
  const sortie = [];
  for (const r of data || []) {
    const statut = String(r.statut_paiement || '').toLowerCase();
    if (statut !== 'paye' && statut !== 'payé') continue;
    const cat = String(r.categorie || '');
    if (evt.type === 'parent_enfant' ? cat !== 'Parent-Enfant' : (cat === 'Parent-Enfant' || cat.toLowerCase().includes('kids'))) continue;
    if (!(r.pack_photo === true || achetes.has(r.id)) || EQUIPES_TEST.includes(r.id)) continue;
    const peu = EQUIPES_PEU.includes(r.id);
    if (servis.has(r.id) && !peu) continue;
    for (const [prenom, email] of [[r.prenom, r.email], [r.co1_prenom, r.co1_email]]) {
      const e = String(email || '').trim().toLowerCase();
      if (e.includes('@')) sortie.push({ inscription_id: r.id, email: e, prenom: String(prenom || '').trim() || null, peu });
    }
  }
  // Une adresse = un mail par événement.
  const vus = new Set();
  return sortie.filter(d => !vus.has(d.email) && vus.add(d.email));
}

async function destinataires(db, evtId) {
  const { data: evt, error: e1 } = await db.from('photos_evenements').select('id,type,inscriptions_depuis').eq('id', evtId).single();
  if (e1) throw e1;
  const { data, error } = await db.from('Inscriptions')
    .select('id,prenom,email,co1_prenom,co1_email,categorie,statut_paiement')
    .gte('created_at', evt.inscriptions_depuis);
  if (error) throw error;
  const parEmail = {};
  for (const r of data || []) {
    const statut = String(r.statut_paiement || '').toLowerCase();
    if (statut !== 'paye' && statut !== 'payé') continue;
    const cat = String(r.categorie || '');
    if (evt.type === 'parent_enfant' ? cat !== 'Parent-Enfant' : (cat === 'Parent-Enfant' || cat.toLowerCase().includes('kids'))) continue;
    for (const [prenom, email] of [[r.prenom, r.email], [r.co1_prenom, r.co1_email]]) {
      const e = String(email || '').trim().toLowerCase();
      if (!e || !e.includes('@')) continue;
      (parEmail[e] = parEmail[e] || []).push(String(prenom || '').trim());
    }
  }
  return Object.keys(parEmail).sort().map(e => {
    const prenoms = [...new Set(parEmail[e].filter(Boolean))];
    return { email: e, prenom: prenoms.length === 1 ? prenoms[0] : null };
  });
}

async function resendBatch(resendKey, emails, cle) {
  const resp = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json', 'Idempotency-Key': cle },
    body: JSON.stringify(emails),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error('Resend ' + resp.status + ' : ' + (json.message || JSON.stringify(json)));
  return (json.data || []).length;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  const b = req.body || {};
  if (!process.env.PHOTOS_ADMIN_PASSWORD || b.password !== process.env.PHOTOS_ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (!process.env.SUPABASE_SERVICE_KEY || !resendKey) return res.status(500).json({ error: 'Configuration serveur incomplète' });
  const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    const listes = {};
    for (const id of EVENEMENTS) listes[id] = await destinataires(db, id);

    // { cible: 'relance' } : relance des packs non récupérés (+ équipes « peu de photos »).
    if (b.cible === 'relance') {
      const rel = {};
      for (const id of EVENEMENTS) rel[id] = await destinatairesRelance(db, id);
      const compte = Object.fromEntries(EVENEMENTS.map(id => [id, {
        adresses: rel[id].length,
        equipes: new Set(rel[id].map(d => d.inscription_id)).size,
        dont_peu_de_photos: rel[id].filter(d => d.peu).length,
      }]));
      if (b.test_to) {
        const to = String(b.test_to).trim();
        const n = await resendBatch(resendKey, [
          { from: FROM, to, reply_to: REPLY_TO, ...mailRelance('hc3', 'Stéphanie (APERÇU)', false) },
          { from: FROM, to, reply_to: REPLY_TO, ...mailRelance('hc3', 'Stéphanie (APERÇU)', true) },
        ], `photos-relance-test-${Date.now()}`);
        return res.status(200).json({ test: true, envoyes: n, destinataires_reels: compte });
      }
      if (b.envoyer !== true) return res.status(200).json({ dry_run: true, nombre: compte });
      const resultat = {};
      for (const id of EVENEMENTS) {
        const liste = rel[id];
        let envoyes = 0;
        for (let i = 0; i < liste.length; i += 100) {
          envoyes += await resendBatch(resendKey,
            liste.slice(i, i + 100).map(d => ({ from: FROM, to: d.email, reply_to: REPLY_TO, ...mailRelance(id, d.prenom, d.peu) })),
            `photos-relance-${id}-lot${i / 100}-v1`);
        }
        resultat[id] = { nombre: liste.length, envoyes };
      }
      return res.status(200).json({ envoye: true, resultat });
    }

    // { cible: 'benevoles' } : même fonctionnement (dry_run / test_to / envoyer) pour le mail bénévoles.
    if (b.cible === 'benevoles') {
      const benevoles = {};
      for (const id of EVENEMENTS) benevoles[id] = await destinatairesBenevoles(db, id, listes[id]);
      if (b.test_to) {
        const to = String(b.test_to).trim();
        const n = await resendBatch(resendKey,
          EVENEMENTS.map(id => ({ from: FROM, to, reply_to: REPLY_TO, ...mailBenevole(id, 'Stéphanie (APERÇU)') })),
          `photos-annonce-benevoles-test-${Date.now()}`);
        return res.status(200).json({ test: true, envoyes: n, destinataires_reels: Object.fromEntries(EVENEMENTS.map(id => [id, benevoles[id].length])) });
      }
      if (b.envoyer !== true) {
        return res.status(200).json({ dry_run: true, nombre: Object.fromEntries(EVENEMENTS.map(id => [id, benevoles[id].length])) });
      }
      const resultat = {};
      for (const id of EVENEMENTS) {
        const liste = benevoles[id];
        let envoyes = 0;
        for (let i = 0; i < liste.length; i += 100) {
          envoyes += await resendBatch(resendKey,
            liste.slice(i, i + 100).map(d => ({ from: FROM, to: d.email, reply_to: REPLY_TO, ...mailBenevole(id, d.prenom) })),
            `photos-annonce-benevoles-${id}-lot${i / 100}-v1`);
        }
        resultat[id] = { nombre: liste.length, envoyes };
      }
      return res.status(200).json({ envoye: true, resultat });
    }

    if (b.test_to) {
      const to = String(b.test_to).trim();
      const n = await resendBatch(resendKey,
        EVENEMENTS.map(id => ({ from: FROM, to, reply_to: REPLY_TO, ...mailPhotos(id, 'Stéphanie (APERÇU)') })),
        `photos-annonce-test-${Date.now()}`);
      return res.status(200).json({ test: true, envoyes: n, destinataires_reels: Object.fromEntries(EVENEMENTS.map(id => [id, listes[id].length])) });
    }

    if (b.envoyer !== true) {
      return res.status(200).json({
        dry_run: true,
        nombre: Object.fromEntries(EVENEMENTS.map(id => [id, listes[id].length])),
        apercu: Object.fromEntries(EVENEMENTS.map(id => [id, listes[id].slice(0, 5)])),
      });
    }

    const resultat = {};
    for (const id of EVENEMENTS) {
      const liste = listes[id];
      let envoyes = 0;
      for (let i = 0; i < liste.length; i += 100) {
        envoyes += await resendBatch(resendKey,
          liste.slice(i, i + 100).map(d => ({ from: FROM, to: d.email, reply_to: REPLY_TO, ...mailPhotos(id, d.prenom) })),
          `photos-annonce-${id}-lot${i / 100}-v1`);
      }
      resultat[id] = { nombre: liste.length, envoyes };
    }
    return res.status(200).json({ envoye: true, resultat });
  } catch (e) {
    console.error('photos-annonce', e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
