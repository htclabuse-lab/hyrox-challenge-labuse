import { createClient } from '@supabase/supabase-js';

function getAgeCat(dob) {
  if (!dob) return null;
  const age = new Date().getFullYear() - parseInt(String(dob).split('-')[0], 10);
  if (age < 16) return null;
  if (age <= 24) return '16-24 ans';
  if (age <= 34) return '25-34 ans';
  if (age <= 44) return '35-44 ans';
  if (age <= 54) return '45-54 ans';
  return '55 ans et +';
}

function getMoyenneAge(dobs) {
  const ages = (dobs || []).filter(Boolean).map(d => new Date().getFullYear() - parseInt(String(d).split('-')[0], 10));
  if (ages.length === 0) return null;
  const moy = Math.round(ages.reduce((a, b) => a + b, 0) / ages.length);
  if (moy < 16) return null;
  if (moy <= 24) return '16-24 ans';
  if (moy <= 34) return '25-34 ans';
  if (moy <= 44) return '35-44 ans';
  if (moy <= 54) return '45-54 ans';
  return '55 ans et +';
}

function buildEmailHtml(inscription) {
  const montantPaye = inscription.prix || 0;
  const isDuo = inscription.categorie?.toLowerCase().includes('duo');
  const isRelais = inscription.categorie?.toLowerCase().includes('relais');
  const tshirt = `${inscription.tshirt_taille || ''} ${inscription.tshirt_coupe || ''}`.trim();
  const prenom = inscription.prenom || '';
  const nom = inscription.nom || '';

  let categorieAge = null;
  if (isDuo || isRelais) {
    const dobs = [
      inscription.date_naissance,
      inscription.co1_date_naissance,
      inscription.co2_date_naissance,
      inscription.co3_date_naissance,
    ];
    categorieAge = getMoyenneAge(dobs);
  } else {
    categorieAge = getAgeCat(inscription.date_naissance);
  }

  const labelAge = (isDuo || isRelais) ? "Catégorie d'âge équipe" : "Catégorie d'âge";
  const valAge = categorieAge ? (isDuo || isRelais ? categorieAge + ' (moyenne)' : categorieAge) : '—';

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
    if (inscription.co1_nom) coequipiers.push({ num: 2, nom: inscription.co1_nom, prenom: inscription.co1_prenom || '', tshirt: inscription.co1_tshirt || '' });
    if (inscription.co2_nom) coequipiers.push({ num: 3, nom: inscription.co2_nom, prenom: inscription.co2_prenom || '', tshirt: inscription.co2_tshirt || '' });
    if (inscription.co3_nom) coequipiers.push({ num: 4, nom: inscription.co3_nom, prenom: inscription.co3_prenom || '', tshirt: inscription.co3_tshirt || '' });
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
          <tr><td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">Athlète</td><td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${prenom} ${nom}</td></tr>
          <tr><td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">Catégorie</td><td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${inscription.categorie || '—'}</td></tr>
          ${equipeLine}
          <tr><td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">T-shirt</td><td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${tshirt || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">${labelAge}</td><td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${valAge}</td></tr>
          <tr><td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">Temps estimé</td><td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${inscription.temps_estime || '—'}</td></tr>
          <tr><td style="padding:8px 0;color:#888;font-size:14px;">Montant payé</td><td style="padding:8px 0;color:#FFEE00;font-weight:800;text-align:right;font-size:16px;">${montantPaye} €</td></tr>
        </table>
        ${coequipiersHtml}
      </div>
      <div style="background:#1a1a00;border:1px solid #FFEE00;border-radius:12px;padding:1rem 1.25rem;margin-top:1rem;">
        <div style="color:#FFEE00;font-weight:700;font-size:14px;line-height:1.6;">⚠️ N'oublie pas : un podium est prévu pour chaque catégorie d'âge !</div>
        <div style="color:#ccc;font-size:13px;line-height:1.6;margin-top:6px;">Reste avec nous jusqu'à la cérémonie de remise des prix, tu pourrais y être 🏆</div>
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

function buildParentEnfantEmailHtml(inscription) {
  const prenomParent = inscription.prenom || '';
  const nomParent = inscription.nom || '';
  const prenomEnfant = inscription.co1_prenom || '';
  const nomEnfant = inscription.co1_nom || '';
  const tshirtParent = `${inscription.tshirt_taille || ''} ${inscription.tshirt_coupe || ''}`.trim() || '—';
  const tshirtEnfant = inscription.co1_tshirt || '—';
  const montantPaye = inscription.prix || 68;

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;padding:2rem;border-radius:12px;">
      <div style="text-align:center;margin-bottom:1.5rem;">
        <h1 style="color:#FFEE00;margin:0;font-size:24px;font-weight:800;letter-spacing:-0.5px;">HYROX <span style="color:#fff">PARENTS / ENFANTS</span></h1>
        <div style="color:#aaa;font-size:13px;margin-top:6px;letter-spacing:2px;">— LA BUSE · 1ÈRE ÉDITION KIDS —</div>
      </div>
      <h2 style="color:#FFEE00;margin-top:1.5rem;font-size:22px;">Inscription confirmée ! 🎉</h2>
      <p style="color:#ccc;line-height:1.7;margin-top:1rem;">
        Bonjour <strong style="color:#fff;">${prenomParent}</strong>,<br><br>
        Ton inscription au <strong style="color:#FFEE00;">format Parent / Enfant</strong> est bien confirmée. On a hâte de vous voir, toi et <strong style="color:#fff;">${prenomEnfant}</strong>, samedi sur la ligne de départ ! 💪
      </p>
      <div style="background:#111;border:1px solid #222;border-radius:12px;padding:1.25rem;margin-top:1.5rem;">
        <div style="color:#FFEE00;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">📋 Récap de votre inscription</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">Parent</td><td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${prenomParent} ${nomParent}</td></tr>
          <tr><td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">Enfant</td><td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${prenomEnfant} ${nomEnfant}</td></tr>
          <tr><td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">T-shirt parent</td><td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${tshirtParent}</td></tr>
          <tr><td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">T-shirt enfant</td><td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${tshirtEnfant}</td></tr>
          <tr><td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">Format</td><td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">Duo Parent + Enfant</td></tr>
          <tr><td style="padding:8px 0;color:#888;font-size:14px;">Montant payé</td><td style="padding:8px 0;color:#FFEE00;font-weight:800;text-align:right;font-size:16px;">${montantPaye} €</td></tr>
        </table>
      </div>
      <div style="margin-top:1.5rem;text-align:center;">
        <img src="https://hyrox-challenge-labuse.vercel.app/affiche-parcours-parent-enfant.jpg" alt="Le parcours Hyrox Parents/Enfants" style="max-width:100%;border-radius:12px;border:1px solid #222;display:block;margin:0 auto;">
      </div>
      <div style="background:#0d1400;border:1px solid #FFEE00;border-radius:12px;padding:1.25rem;margin-top:1.5rem;text-align:center;">
        <div style="color:#FFEE00;font-weight:800;font-size:14px;margin-bottom:8px;">📅 Samedi 27 juin 2026 — après-midi</div>
        <div style="color:#ccc;font-size:14px;">📍 Crossfit La Buse — Saint-Paul, La Réunion</div>
      </div>
      <p style="color:#888;font-size:13px;text-align:center;margin-top:1rem;font-style:italic;">L'horaire précis de votre passage vous sera communiqué quelques jours avant.</p>
      <p style="color:#FFEE00;font-weight:800;text-align:center;font-size:18px;margin-top:2rem;letter-spacing:1px;">Ce samedi, on fait équipe en famille 💛</p>
      <p style="color:#555;font-size:11px;text-align:center;margin-top:2rem;border-top:1px solid #222;padding-top:1.25rem;">
        Hyrox Training Club La Buse — Saint-Paul, La Réunion<br>
        <a href="https://hyrox-challenge-labuse.vercel.app" style="color:#888;text-decoration:none;">hyrox-challenge-labuse.vercel.app</a>
      </p>
    </div>
  `;
}

function isParentEnfantInscription(inscription) {
  const cat = (inscription.categorie || '').toLowerCase();
  return cat.indexOf('parent') !== -1 && cat.indexOf('enfant') !== -1;
}

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
        body: JSON.stringify({ from: FROM, to, subject, html }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return res.status(502).json({ error: 'Erreur Resend', status: resp.status, details: data });
      }
      return res.status(200).json({ success: true, mode: 'custom', sent_to: to, resend_id: data.id || null });
    }

    // ----- MODE 'broadcast' : envoi à tous les inscrits payés (ou subset), HTML/subject custom -----
    if (mode === 'broadcast') {
      const { subject, html, limit, exclude_emails } = req.body;
      if (!subject || !html) {
        return res.status(400).json({ error: 'subject et html requis' });
      }

      const supabase = createClient('https://mzyfnmjzlosranptwucr.supabase.co', process.env.SUPABASE_SERVICE_KEY);
      const { data: inscriptions, error: fetchErr } = await supabase
        .from('Inscriptions')
        .select('email')
        .eq('statut_paiement', 'paye')
        .not('email', 'is', null);

      if (fetchErr) {
        console.error('Erreur fetch broadcast:', fetchErr);
        return res.status(500).json({ error: 'Erreur lecture inscriptions' });
      }

      const excludeSet = new Set((exclude_emails || []).map(e => String(e).trim().toLowerCase()));
      const seen = new Set();
      const eligibles = [];
      for (const r of inscriptions || []) {
        const email = String(r.email || '').trim().toLowerCase();
        if (!email || !email.includes('@')) continue;
        if (excludeSet.has(email)) continue;
        if (seen.has(email)) continue;
        seen.add(email);
        eligibles.push(email);
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
        const payload = batch.map(email => ({ from: FROM, to: email, subject, html }));
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
    const html = parentEnfantMode ? buildParentEnfantEmailHtml(inscription) : buildEmailHtml(inscription);
    const subject = parentEnfantMode
      ? '🎉 Inscription confirmée — Hyrox Parents / Enfants La Buse'
      : '✅ Inscription confirmée — Hyrox Challenge La Buse';
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: inscription.email, subject, html }),
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
