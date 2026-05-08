import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

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
      const html = buildEmailHtml(inscription, nomStripe, montantPaye);

      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + resendKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Hyrox Challenge La Buse <noreply@htclabuse.fr>',
          to: email,
          subject: '✅ Inscription confirmée — Hyrox Challenge La Buse',
          html: html
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

function buildEmailHtml(inscription, nomStripe, montantPaye) {
  if (!inscription) {
    return `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#fff;padding:2rem;border-radius:12px;">
        <div style="text-align:center;margin-bottom:1.5rem;">
          <h1 style="color:#FFEE00;margin:0;font-size:26px;">Hyrox Challenge <span style="color:#fff">La Buse</span></h1>
        </div>
        <h2 style="color:#FFEE00;margin-top:1.5rem;">Inscription confirmée ! 🎉</h2>
        <p style="color:#ccc;line-height:1.7;margin-top:1rem;">
          Bonjour ${nomStripe || ''},<br><br>
          Ton inscription au <strong style="color:#FFEE00;">Hyrox Challenge La Buse #2</strong> est bien confirmée !<br><br>
          📅 <strong>Dimanche 12 juillet 2026</strong><br>
          📍 <strong>Crossfit La Buse — Saint-Paul, La Réunion</strong><br><br>
          Montant payé : <strong style="color:#FFEE00;">${montantPaye} €</strong><br><br>
          On t'attend sur la ligne de départ ! 💪
        </p>
        <div style="text-align:center;margin-top:2rem;">
          <a href="https://hyrox-challenge-labuse.vercel.app" style="background:#FFEE00;color:#0a0a0a;padding:12px 30px;border-radius:8px;text-decoration:none;font-weight:800;">Voir le site</a>
        </div>
        <p style="color:#666;font-size:12px;text-align:center;margin-top:2rem;">Hyrox Training Club La Buse — Saint-Paul, La Réunion</p>
      </div>
    `;
  }

  const isDuo = inscription.categorie?.toLowerCase().includes('duo');
  const isRelais = inscription.categorie?.toLowerCase().includes('relais');
  const tshirt = `${inscription.tshirt_taille || ''} ${inscription.tshirt_coupe || ''}`.trim();
  const prenom = inscription.prenom || nomStripe || '';
  const nom = inscription.nom || '';

  let equipeLine = '';
  if (inscription.nom_equipe) {
    equipeLine = `
      <tr>
        <td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">Équipe</td>
        <td style="padding:8px 0;color:#FFEE00;font-weight:700;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${inscription.nom_equipe}</td>
      </tr>
    `;
  }

  let coequipiersHtml = '';
  if (isDuo || isRelais) {
    const coequipiers = [];
    if (inscription.co1_nom) {
      coequipiers.push({ num: 2, nom: inscription.co1_nom, prenom: inscription.co1_prenom || '', tshirt: inscription.co1_tshirt || '' });
    }
    if (inscription.co2_nom) {
      coequipiers.push({ num: 3, nom: inscription.co2_nom, prenom: inscription.co2_prenom || '', tshirt: inscription.co2_tshirt || '' });
    }
    if (inscription.co3_nom) {
      coequipiers.push({ num: 4, nom: inscription.co3_nom, prenom: inscription.co3_prenom || '', tshirt: inscription.co3_tshirt || '' });
    }

    if (coequipiers.length > 0) {
      coequipiersHtml = `
        <div style="margin-top:1.5rem;padding-top:1.5rem;border-top:1px solid #222;">
          <div style="color:#FFEE00;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">👥 Coéquipiers</div>
          ${coequipiers.map(co => `
            <div style="background:#0a0a0a;border:1px solid #222;border-radius:8px;padding:10px 14px;margin-bottom:8px;">
              <div style="color:#fff;font-size:14px;font-weight:600;">Athlète ${co.num} : ${co.prenom} ${co.nom}</div>
              <div style="color:#888;font-size:12px;margin-top:2px;">T-shirt : ${co.tshirt || '—'}</div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#fff;padding:2rem;border-radius:12px;">
      <div style="text-align:center;margin-bottom:1.5rem;">
        <h1 style="color:#FFEE00;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px;">Hyrox Challenge <span style="color:#fff">La Buse</span></h1>
      </div>
      <h2 style="color:#FFEE00;margin-top:1.5rem;font-size:22px;">Inscription confirmée ! 🎉</h2>
      <p style="color:#ccc;line-height:1.7;margin-top:1rem;">
        Bonjour <strong style="color:#fff;">${prenom}</strong>,<br><br>
        Ton inscription au <strong style="color:#FFEE00;">Hyrox Challenge La Buse #2</strong> est bien confirmée. À très vite sur la ligne de départ ! 💪
      </p>
      <div style="background:#111;border:1px solid #222;border-radius:12px;padding:1.25rem;margin-top:1.5rem;">
        <div style="color:#FFEE00;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">📋 Récap de ton inscription</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">Athlète</td>
            <td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${prenom} ${nom}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">Catégorie</td>
            <td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${inscription.categorie || '—'}</td>
          </tr>
          ${equipeLine}
          <tr>
            <td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">T-shirt</td>
            <td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${tshirt || '—'}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">Temps estimé</td>
            <td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${inscription.temps_estime || '—'}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#888;font-size:14px;">Montant payé</td>
            <td style="padding:8px 0;color:#FFEE00;font-weight:800;text-align:right;font-size:16px;">${montantPaye} €</td>
          </tr>
        </table>
        ${coequipiersHtml}
      </div>
      <div style="background:#0d1400;border:1px solid #FFEE00;border-radius:12px;padding:1.25rem;margin-top:1.5rem;text-align:center;">
        <div style="color:#FFEE00;font-weight:800;font-size:14px;margin-bottom:8px;">📅 Dimanche 12 juillet 2026</div>
        <div style="color:#ccc;font-size:14px;">📍 Crossfit La Buse — Saint-Paul, La Réunion</div>
      </div>
      <div style="text-align:center;margin-top:1.5rem;">
        <a href="https://hyrox-challenge-labuse.vercel.app" style="background:#FFEE00;color:#0a0a0a;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:800;display:inline-block;">Voir le site</a>
      </div>
      <p style="color:#888;font-size:13px;line-height:1.7;margin-top:2rem;text-align:center;">
        Ton dossard et tes horaires de passage te seront communiqués par email une fois toutes les inscriptions clôturées.
      </p>
      <p style="color:#555;font-size:11px;text-align:center;margin-top:2rem;border-top:1px solid #222;padding-top:1.25rem;">
        Hyrox Training Club La Buse — Saint-Paul, La Réunion<br>
        <a href="https://hyrox-challenge-labuse.vercel.app" style="color:#888;text-decoration:none;">hyrox-challenge-labuse.vercel.app</a>
      </p>
    </div>
  `;
}

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
