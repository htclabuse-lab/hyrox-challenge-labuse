import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import {
  isParentEnfantInscription,
  buildParentEnfantEmailHtml,
  buildEmailHtml,
  buildPackPhotoEmailHtml,
  destinatairesInscription,
} from '../lib/email-template.js';

// Prix du pack photo acheté séparément après l'inscription (add-on).
const PACK_PHOTO_PRIX = 20;

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const resendKey = process.env.RESEND_API_KEY;
  const supabaseUrl = 'https://mzyfnmjzlosranptwucr.supabase.co';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  const stripe = new Stripe(stripeSecret);
  const sig = req.headers['stripe-signature'];
  const rawBody = await buffer(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send('Webhook error: ' + err.message);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
   const email = session.customer_details?.email;
    const nomStripe = session.customer_details?.name;
    const montantPaye = (session.amount_total || 0) / 100;
    const clientReferenceId = session.client_reference_id;

    console.log('Paiement reçu pour:', email, '- Montant:', montantPaye, '- Ref:', clientReferenceId);

    // ----- ACHAT DU PACK PHOTO "PLUS TARD" (add-on) -----
    // Le lien de paiement du pack passe client_reference_id = "pack-<id>".
    // Ce n'est PAS une nouvelle inscription : on ajoute juste le pack à la ligne
    // existante (deja payee) et on envoie un petit mail de confirmation.
    if (typeof clientReferenceId === 'string' && clientReferenceId.indexOf('pack-') === 0) {
      const packInscriptionId = clientReferenceId.slice('pack-'.length);
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: found, error: selErr } = await supabase
          .from('Inscriptions').select('*').eq('id', packInscriptionId).limit(1);
        if (selErr || !found || !found.length) {
          console.warn('Pack photo : inscription introuvable pour', clientReferenceId);
        } else {
          const insc = found[0];
          const nouveauPrix = (Number(insc.prix) || 0) + PACK_PHOTO_PRIX;
          await supabase.from('Inscriptions')
            .update({ pack_photo: true, prix: nouveauPrix })
            .eq('id', insc.id);
          console.log('Pack photo ajouté à l\'inscription', insc.id);
          if (resendKey && insc.email) {
            try {
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  from: 'Hyrox Challenge La Buse <noreply@htclabuse.fr>',
                  to: destinatairesInscription(insc, email),
                  subject: '📸 Ton pack photo est confirmé — Hyrox Challenge La Buse',
                  html: buildPackPhotoEmailHtml(insc),
                  reply_to: 'htclabuse@gmail.com',
                }),
              });
            } catch (mailErr) {
              console.error('Pack photo : erreur envoi mail', mailErr);
            }
          }
        }
      } catch (err) {
        console.error('Pack photo : erreur traitement', err);
      }
      return res.status(200).json({ received: true, type: 'pack_photo' });
    }

    let inscription = null;

    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      let inscriptionsQuery;
      if (clientReferenceId) {
        // Nouveau systeme : matching par id Supabase (fiable, independant de l'email Stripe)
        inscriptionsQuery = supabase
          .from('Inscriptions')
          .select('*')
          .eq('id', clientReferenceId)
          .limit(1);
      } else {
        // Fallback ancien systeme : matching par email (au cas ou un vieux lien sans client_reference_id serait utilise)
        inscriptionsQuery = supabase
          .from('Inscriptions')
          .select('*')
          .eq('email', email)
          .eq('statut_paiement', 'en_attente')
          .order('created_at', { ascending: false })
          .limit(1);
      }

      const { data: inscriptions, error: selectError } = await inscriptionsQuery;

      if (selectError) {
        console.error('Erreur Supabase select:', selectError);
      } else if (inscriptions && inscriptions.length > 0) {
        inscription = inscriptions[0];
        const { error: updateError } = await supabase
          .from('Inscriptions')
          .update({ statut_paiement: 'paye' })
          .eq('id', inscription.id);

        if (updateError) {
          console.error('Erreur Supabase update:', updateError);
        } else {
          console.log('Inscription', inscription.id, 'marquee comme payee');
        }
      } else {
        console.warn('Aucune inscription trouvee. Ref:', clientReferenceId, 'Email:', email);
      }
    } catch (err) {
      console.error('Erreur lors de la mise a jour Supabase:', err);
    }

    try {
      // Détection Parent-Enfant : soit via la catégorie de l'inscription en DB,
      // soit via le montant payé Stripe (68€ = Parent-Enfant) si aucune inscription trouvée.
      const parentEnfantMode = isParentEnfantInscription(inscription) || (!inscription && montantPaye === 68);
      const html = parentEnfantMode
        ? buildParentEnfantEmailHtml(inscription, nomStripe, montantPaye)
        : buildEmailHtml(inscription, nomStripe, montantPaye);
      const subject = parentEnfantMode
        ? '🎉 Inscription confirmée — Hyrox Parents / Enfants La Buse'
        : '✅ Inscription confirmée — Hyrox Challenge La Buse';

      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + resendKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Hyrox Challenge La Buse <noreply@htclabuse.fr>',
          to: destinatairesInscription(inscription, email),
          subject,
          html,
          reply_to: 'htclabuse@gmail.com'
        })
      });

      if (!resendResponse.ok) {
        const errorText = await resendResponse.text();
        console.error('Erreur Resend:', resendResponse.status, errorText);
      } else {
        console.log('Mail envoyé à:', email);
      }
    } catch (err) {
      console.error('Erreur lors de l\'envoi du mail:', err);
    }
  }

  res.status(200).json({ received: true });
}

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
