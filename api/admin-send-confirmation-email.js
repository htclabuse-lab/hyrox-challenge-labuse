import { createClient } from '@supabase/supabase-js';
import {
  isParentEnfantInscription,
  buildParentEnfantEmailHtml,
  buildEmailHtml,
  destinatairesInscription,
} from '../lib/email-template.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { password, mode } = req.body || {};

    if (!password || password !== process.env.JUGES_PASSWORD) {
      return res.status(401).json({ error: 'Non autorisé' });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return res.status(500).json({ error: 'RESEND_API_KEY non configurée' });
    }

    const FROM = 'Hyrox Challenge La Buse <noreply@htclabuse.fr>';
    const REPLY_TO = 'htclabuse@gmail.com';

    // ----- MODE 'custom' : envoi unique à un email arbitraire avec subject/html sur mesure -----
    if (mode === 'custom') {
      const { to, subject, html } = req.body;
      if (!to || typeof to !== 'string' || !to.includes('@')) {
        return res.status(400).json({ error: 'to (email) invalide' });
      }
      if (!subject || !html) {
        return res.status(400).json({ error: 'subject et html requis' });
      }
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to, subject, html, reply_to: REPLY_TO }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return res.status(502).json({ error: 'Erreur Resend', status: resp.status, details: data });
      }
      return res.status(200).json({ success: true, mode: 'custom', sent_to: to, resend_id: data.id || null });
    }

    // ----- MODE 'broadcast' : envoi à tous les inscrits payés (ou subset), HTML/subject custom -----
    if (mode === 'broadcast') {
      // extra_emails : adresses hors base (ex. anciens participants HC #1, dont les
      // inscriptions ne sont pas dans Supabase). Elles passent par le même
      // dédoublonnage et les mêmes exclusions que les adresses lues en base.
      const { subject, html, limit, exclude_emails, extra_emails } = req.body;
      if (!subject || !html) {
        return res.status(400).json({ error: 'subject et html requis' });
      }

      const supabase = createClient('https://mzyfnmjzlosranptwucr.supabase.co', process.env.SUPABASE_SERVICE_KEY);
      const { data: inscriptions, error: fetchErr } = await supabase
        .from('Inscriptions')
        .select('email, co1_email')
        .eq('statut_paiement', 'paye')
        .not('email', 'is', null);

      if (fetchErr) {
        console.error('Erreur fetch broadcast:', fetchErr);
        return res.status(500).json({ error: 'Erreur lecture inscriptions' });
      }

      const excludeSet = new Set((exclude_emails || []).map(e => String(e).trim().toLowerCase()));
      const seen = new Set();
      const eligibles = [];
      // L'inscrit principal ET son coéquipier (si son adresse a été renseignée).
      // Le dédoublonnage global évite qu'un binôme partageant une boîte, ou
      // quelqu'un inscrit sur plusieurs équipes, reçoive le mail en double.
      const sources = [
        ...(inscriptions || []).map(r => [r.email, r.co1_email]),
        ...(Array.isArray(extra_emails) ? extra_emails.map(e => [e]) : []),
      ];
      for (const r of sources) {
        for (const brut of r) {
          const email = String(brut || '').trim().toLowerCase();
          if (!email || !email.includes('@')) continue;
          if (excludeSet.has(email)) continue;
          if (seen.has(email)) continue;
          seen.add(email);
          eligibles.push(email);
        }
      }

      const cap = (typeof limit === 'number' && limit > 0) ? limit : eligibles.length;
      const targets = eligibles.slice(0, cap);

      if (targets.length === 0) {
        return res.status(200).json({ success: true, mode: 'broadcast', total_eligible: eligibles.length, sent: 0, sent_emails: [] });
      }

      const sent_emails = [];
      const failures = [];
      for (let i = 0; i < targets.length; i += 100) {
        const batch = targets.slice(i, i + 100);
        const payload = batch.map(email => ({ from: FROM, to: email, subject, html, reply_to: REPLY_TO }));
        const resp = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          failures.push({ batch_start: i, status: resp.status, error: data });
        } else {
          sent_emails.push(...batch);
        }
      }

      return res.status(200).json({
        success: failures.length === 0,
        mode: 'broadcast',
        total_eligible: eligibles.length,
        sent: sent_emails.length,
        sent_emails,
        failures,
      });
    }

    // ----- MODE 'standard' (par défaut) : envoi du template de confirmation d'inscription -----
    const { inscription_id } = req.body;
    if (!Number.isInteger(inscription_id) || inscription_id <= 0) {
      return res.status(400).json({ error: 'inscription_id invalide' });
    }

    const supabase = createClient('https://mzyfnmjzlosranptwucr.supabase.co', process.env.SUPABASE_SERVICE_KEY);
    const { data: inscription, error: fetchErr } = await supabase
      .from('Inscriptions')
      .select('*')
      .eq('id', inscription_id)
      .single();

    if (fetchErr || !inscription) {
      console.error('Erreur fetch:', fetchErr);
      return res.status(404).json({ error: 'Inscription introuvable' });
    }
    if (!inscription.email) {
      return res.status(400).json({ error: 'Cette inscription n\'a pas d\'email' });
    }

    const parentEnfantMode = isParentEnfantInscription(inscription);
    // Le template partagé attend (inscription, nomStripe, montantPaye).
    // Ici l'inscription vient de la BDD : pas de nom Stripe, et le montant est celui enregistré.
    const html = parentEnfantMode
      ? buildParentEnfantEmailHtml(inscription, null, inscription.prix)
      : buildEmailHtml(inscription, null, inscription.prix);
    const subject = parentEnfantMode
      ? '🎉 Inscription confirmée — Hyrox Parents / Enfants La Buse'
      : '✅ Inscription confirmée — Hyrox Challenge La Buse';
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: destinatairesInscription(inscription), subject, html, reply_to: REPLY_TO }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error('Erreur Resend:', resendResponse.status, errorText);
      return res.status(502).json({ error: 'Erreur d\'envoi Resend', details: errorText });
    }

    const result = await resendResponse.json();
    return res.status(200).json({
      success: true,
      mode: 'standard',
      sent_to: inscription.email,
      resend_id: result.id || null,
      inscription: {
        id: inscription.id,
        prenom: inscription.prenom,
        nom: inscription.nom,
        nom_equipe: inscription.nom_equipe,
        prix: inscription.prix,
      },
    });
  } catch (err) {
    console.error('Erreur admin-send-confirmation-email:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
