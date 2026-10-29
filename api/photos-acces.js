import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../lib/kids.js';
import { FROM as FROM_PE, REPLY_TO, TYPE_STRIPE_PACK as TYPE_PACK_PE } from '../lib/parent-enfant.js';
import { lienSigne, clesPhoto } from '../lib/r2.js';
import {
  lireBon, emailValide, inscriptionsPourEmail, inscriptionEtPack, personnesCouvertes, SELFIES_PAR_PERSONNE,
} from '../lib/photos.js';

// ============================================================================
// Plateforme photos — déblocage et espace photo personnel.
//
//  POST { action: 'debloquer', evenement_id, email, bons: [bon, ...] }
//        → si l'inscription liée à cet email a le pack : crée/complète l'accès et
//          ENVOIE LE LIEN PAR MAIL à cet email (jamais affiché à l'écran).
//          Sinon : { paiement_requis: true }.
//  POST { action: 'payer', evenement_id, email }
//        → session de paiement Stripe du pack (bon compte selon l'événement). Le
//          paiement est enregistré par les webhooks EXISTANTS, qui cochent déjà
//          pack_photo sur l'inscription (même convention que les pages « Ajouter le
//          pack photo ») ; au retour, la page relance 'debloquer'.
//  POST { action: 'espace', jeton }        → photos de l'espace (nettes + HD)
//  POST { action: 'ajouter', jeton, bon }  → ajoute les photos d'un nouveau selfie
// ============================================================================

const ANTI_SPAM_MS = 2 * 60 * 1000;  // pas plus d'un mail toutes les 2 min par accès
const DUREE_LIENS = 2 * 3600;        // liens de l'espace valables 2 h

function masquer(email) {
  const [nom, dom] = email.split('@');
  return nom.slice(0, 2) + '•••@' + dom;
}

function photosDesBons(bons, evenementId) {
  const ids = new Set();
  let valides = 0;
  for (const bon of (Array.isArray(bons) ? bons : []).slice(0, 10)) {
    const lu = lireBon(bon);
    if (!lu || lu.evenementId !== evenementId) continue;
    valides++;
    lu.photoIds.forEach(id => ids.add(id));
  }
  return { ids: [...ids], valides };
}

function mailEspace(evt, insc, lien) {
  const prenom = String(insc.prenom || '').trim() || 'à toi';
  const date = new Date(evt.date_evenement + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#fff;padding:2rem 1.5rem;border-radius:12px;">
      <div style="text-align:center;margin-bottom:1.25rem;">
        <div style="font-size:12px;color:#888;letter-spacing:2px;text-transform:uppercase;font-weight:800;">Hyrox Training Club La Buse</div>
      </div>
      <h2 style="color:#FFEE00;font-size:22px;margin:0 0 1rem;">Tes photos sont prêtes 📸</h2>
      <p style="color:#ddd;font-size:15px;line-height:1.7;margin:0 0 1.25rem;">
        Salut <strong style="color:#fff;">${prenom}</strong>,<br><br>
        Voici ton espace photo du <strong style="color:#fff;">${evt.nom}</strong> (${date}) :
        toutes tes photos en haute définition, sans filigrane, à télécharger.
      </p>
      <div style="text-align:center;margin:1.5rem 0;">
        <a href="${lien}" style="display:inline-block;background:#FFEE00;color:#0a0a0a;font-weight:900;font-size:16px;padding:14px 36px;border-radius:10px;text-decoration:none;">📸 Voir et télécharger mes photos</a>
      </div>
      <p style="color:#999;font-size:13px;line-height:1.6;margin:0;">
        🔒 Ce lien est personnel : garde-le pour toi.<br>
        Il te manque des photos ? Dans ton espace, tu peux relancer la recherche avec un autre selfie.
      </p>
      <p style="color:#555;font-size:11px;text-align:center;margin-top:2rem;border-top:1px solid #222;padding-top:1.25rem;">
        Hyrox Training Club La Buse — Saint-Paul, La Réunion<br>
        <a href="https://hyrox-challenge-labuse.vercel.app/#accueil" style="color:#888;text-decoration:none;">hyrox-challenge-labuse.vercel.app</a>
      </p>
    </div>`;
}

async function envoyerMail(evt, insc, email, lien) {
  const cle = process.env.RESEND_API_KEY;
  if (!cle) throw new Error('Envoi de mail non configuré');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + cle, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: evt.type === 'parent_enfant' ? FROM_PE : 'Hyrox Challenge La Buse <noreply@htclabuse.fr>',
      to: [email],                         // UNIQUEMENT l'adresse saisie, qui appartient à l'inscription
      subject: `📸 Tes photos du ${evt.nom}`,
      html: mailEspace(evt, insc, lien),
      reply_to: REPLY_TO,
    }),
  });
  if (!r.ok) throw new Error('Envoi du mail impossible (' + r.status + ')');
}

async function lireAcces(db, jeton) {
  if (!/^[0-9a-f]{48}$/.test(String(jeton || ''))) return null;
  const { data } = await db.from('photos_acces').select('*').eq('jeton', jeton).eq('statut', 'actif').maybeSingle();
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  const b = req.body || {};
  const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    // ------------------------------------------------------------ déblocage
    if (b.action === 'debloquer') {
      const email = String(b.email || '').trim().toLowerCase();
      if (!emailValide(email)) return res.status(400).json({ error: 'Adresse email invalide.' });
      const { data: evt } = await db.from('photos_evenements').select('*').eq('id', String(b.evenement_id || '')).maybeSingle();
      if (!evt || (evt.statut !== 'ouvert' && evt.id !== 'test')) return res.status(404).json({ error: 'Événement introuvable.' });

      const { ids, valides } = photosDesBons(b.bons, evt.id);
      if (!valides) return res.status(400).json({ error: 'Ta recherche a expiré : refais un selfie, puis réessaie.' });

      const inscriptions = await inscriptionsPourEmail(db, evt, email);
      if (!inscriptions.length) {
        return res.status(404).json({ error: "Aucune inscription trouvée avec cet email pour cet événement. Utilise bien l'adresse de ton inscription." });
      }

      const { insc, origine } = await inscriptionEtPack(db, evt, inscriptions);
      if (!origine) {
        return res.status(200).json({ paiement_requis: true, prix_cents: evt.prix_pack_cents });
      }

      const maxSelfies = personnesCouvertes(evt, insc, email) * SELFIES_PAR_PERSONNE;
      const { data: existant } = await db.from('photos_acces').select('*')
        .eq('evenement_id', evt.id).eq('inscription_id', insc.id).eq('email', email).maybeSingle();

      let acces;
      if (existant) {
        const photoIds = [...new Set([...existant.photo_ids, ...ids])];
        const nb = Math.min(existant.nb_visages + valides, maxSelfies);
        const { data, error } = await db.from('photos_acces')
          .update({ photo_ids: photoIds, nb_visages: nb, statut: 'actif', updated_at: new Date().toISOString() })
          .eq('id', existant.id).select('*').single();
        if (error) throw error;
        acces = data;
      } else {
        const { data, error } = await db.from('photos_acces').insert({
          evenement_id: evt.id, inscription_id: insc.id, email, origine, statut: 'actif',
          photo_ids: ids, nb_visages: Math.min(valides, maxSelfies),
        }).select('*').single();
        if (error) throw error;
        acces = data;
      }

      // Anti-spam : on ne renvoie pas le mail plusieurs fois de suite.
      const dernier = acces.mail_envoye_le ? new Date(acces.mail_envoye_le).getTime() : 0;
      if (Date.now() - dernier > ANTI_SPAM_MS) {
        const origin = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host);
        await envoyerMail(evt, insc, email, `${origin}/photos-espace.html?j=${acces.jeton}`);
        await db.from('photos_acces').update({ mail_envoye_le: new Date().toISOString() }).eq('id', acces.id);
      }
      return res.status(200).json({ ok: true, email_masque: masquer(email) });
    }

    // ------------------------------------------------------------ paiement
    if (b.action === 'payer') {
      const email = String(b.email || '').trim().toLowerCase();
      if (!emailValide(email)) return res.status(400).json({ error: 'Adresse email invalide.' });
      const { data: evt } = await db.from('photos_evenements').select('*').eq('id', String(b.evenement_id || '')).maybeSingle();
      if (!evt || (evt.statut !== 'ouvert' && evt.id !== 'test')) return res.status(404).json({ error: 'Événement introuvable.' });
      const inscriptions = await inscriptionsPourEmail(db, evt, email);
      if (!inscriptions.length) {
        return res.status(404).json({ error: "Aucune inscription trouvée avec cet email pour cet événement. Utilise bien l'adresse de ton inscription." });
      }
      const { insc, origine } = await inscriptionEtPack(db, evt, inscriptions);
      if (origine) return res.status(200).json({ deja_pack: true });

      const hyrox = evt.compte_stripe === 'hyrox';
      const cle = hyrox ? process.env.STRIPE_SECRET_KEY : process.env.STRIPE_KIDS_SECRET_KEY;
      if (!cle) return res.status(500).json({ error: 'Paiement non configuré.' });
      const stripe = new Stripe(cle);
      const origin = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host);
      const retour = `${origin}/photos.html?evt=${encodeURIComponent(evt.id)}`;
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        locale: 'fr',
        customer_email: email,
        // Conventions des webhooks existants :
        //  - compte Hyrox : api/webhook.js reconnaît client_reference_id « pack-<id> » ;
        //  - compte Training Club : api/kids-webhook.js reconnaît metadata.type pack P-E.
        client_reference_id: 'pack-' + insc.id,
        metadata: {
          ...(hyrox ? {} : { type: TYPE_PACK_PE }),
          inscription_id: String(insc.id),
          evenement_id: evt.id,
          source: 'plateforme-photos',
        },
        line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: evt.prix_pack_cents,
          product_data: { name: `Pack photo — ${evt.nom}`, description: 'Toutes tes photos en haute définition, sans filigrane' } } }],
        success_url: retour + '&paye=1',
        cancel_url: retour,
      });
      return res.status(200).json({ url: session.url });
    }

    // ------------------------------------------------------------ espace photo
    if (b.action === 'espace') {
      const acces = await lireAcces(db, b.jeton);
      if (!acces) return res.status(404).json({ error: 'Lien invalide ou expiré.' });
      const { data: evt } = await db.from('photos_evenements').select('*').eq('id', acces.evenement_id).single();
      const { data: insc } = await db.from('Inscriptions').select('id,prenom,email,co1_email,categorie').eq('id', acces.inscription_id).single();

      const personnes = personnesCouvertes(evt, insc, acces.email);
      const photos = [];
      for (const [i, id] of acces.photo_ids.entries()) {
        const cles = clesPhoto(evt.id, id);
        const nom = `HTC-La-Buse-${evt.id}-${String(i + 1).padStart(3, '0')}.jpg`;
        photos.push({
          photo_id: id,
          nette: await lienSigne('GET', cles.web, { expireSecondes: DUREE_LIENS }),
          hd: await lienSigne('GET', cles.hd, { expireSecondes: DUREE_LIENS, telechargerSous: nom }),
          hd_brut: await lienSigne('GET', cles.hd, { expireSecondes: DUREE_LIENS }),
          nom,
        });
      }
      return res.status(200).json({
        evenement: { id: evt.id, nom: evt.nom, date_evenement: evt.date_evenement, type: evt.type },
        prenom: insc.prenom || '',
        photos,
        selfies_restants: Math.max(0, personnes * SELFIES_PAR_PERSONNE - acces.nb_visages),
        peut_ajouter: personnes > 1 ? (evt.type === 'parent_enfant' ? 'enfant' : 'partenaire') : null,
      });
    }

    // ------------------------------------------------------------ ajout d'un selfie
    if (b.action === 'ajouter') {
      const acces = await lireAcces(db, b.jeton);
      if (!acces) return res.status(404).json({ error: 'Lien invalide ou expiré.' });
      const { data: evt } = await db.from('photos_evenements').select('*').eq('id', acces.evenement_id).single();
      const { data: insc } = await db.from('Inscriptions').select('id,email,co1_email,categorie').eq('id', acces.inscription_id).single();
      const max = personnesCouvertes(evt, insc, acces.email) * SELFIES_PAR_PERSONNE;
      if (acces.nb_visages >= max) {
        return res.status(403).json({ error: "Tu as atteint le nombre maximum de recherches pour ce pack. Écris-nous si des photos manquent encore." });
      }
      const { ids, valides } = photosDesBons([b.bon], evt.id);
      if (!valides) return res.status(400).json({ error: 'Recherche expirée, refais le selfie.' });
      const avant = new Set(acces.photo_ids);
      const nouvelles = ids.filter(id => !avant.has(id));
      const { error } = await db.from('photos_acces').update({
        photo_ids: [...acces.photo_ids, ...nouvelles], nb_visages: acces.nb_visages + 1, updated_at: new Date().toISOString(),
      }).eq('id', acces.id);
      if (error) throw error;
      return res.status(200).json({ nouvelles: nouvelles.length });
    }

    return res.status(400).json({ error: 'Action inconnue' });
  } catch (e) {
    console.error('photos-acces', b.action, e);
    return res.status(500).json({ error: 'Erreur serveur, réessaie dans un instant.' });
  }
}
