// Template des mails de confirmation d'inscription.
// Source unique partagée par :
//   - api/webhook.js                     (envoi réel après paiement Stripe)
//   - api/admin-send-confirmation-email.js (preview / renvoi manuel depuis l'admin)
// Toute modif du mail se fait ICI et se répercute automatiquement sur les deux.

/**
 * Destinataires d'un mail d'inscription : l'inscrit principal + le coéquipier
 * s'il a renseigné son adresse (optionnel). Dédoublonne (les binômes qui
 * partagent une boîte ne reçoivent pas deux fois) et ignore les adresses vides
 * ou invalides. Retourne toujours un tableau, jamais vide si emailPrincipal est
 * valide — Resend accepte un tableau dans `to`.
 */
export function destinatairesInscription(inscription, emailFallback) {
  const brut = [
    (inscription && inscription.email) || emailFallback,
    inscription && inscription.co1_email,
  ];
  const vus = new Set();
  const sortie = [];
  for (const e of brut) {
    const adresse = String(e || '').trim();
    if (!adresse || !adresse.includes('@')) continue;
    const cle = adresse.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    sortie.push(adresse);
  }
  return sortie;
}

/**
 * Petit mail de confirmation après l'achat du pack photo « plus tard »
 * (add-on payé séparément, hors inscription initiale).
 */
export function buildPackPhotoEmailHtml(inscription) {
  const prenom = ((inscription && inscription.prenom) || '').trim() || 'à toi';
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#fff;padding:2rem 1.5rem;border-radius:12px;">
      <div style="text-align:center;margin-bottom:1.25rem;">
        <div style="font-size:12px;color:#888;letter-spacing:2px;text-transform:uppercase;font-weight:800;">Hyrox Training Club La Buse</div>
      </div>
      <h2 style="color:#FFEE00;font-size:22px;margin:0 0 1rem;">Ton pack photo est confirmé 📸</h2>
      <p style="color:#ddd;font-size:15px;line-height:1.7;margin:0 0 1.25rem;">
        Salut <strong style="color:#fff;">${prenom}</strong>,<br><br>
        C'est tout bon : le <strong style="color:#fff;">pack photo</strong> est bien ajouté à ton inscription au <strong style="color:#fff;">Hyrox Challenge La Buse #3</strong> (dimanche 15 novembre 2026).<br><br>
        Le jour J, un photographe couvrira ta zone de course — tu recevras tes photos après l'événement.
      </p>
      <div style="text-align:center;margin-top:1.5rem;">
        <a href="https://hyrox-challenge-labuse.vercel.app/#accueil" style="display:inline-block;background:#FFEE00;color:#0a0a0a;font-weight:900;font-size:16px;padding:14px 36px;border-radius:10px;text-decoration:none;">🌐 Voir toutes les infos</a>
      </div>
      <p style="color:#555;font-size:11px;text-align:center;margin-top:2rem;border-top:1px solid #222;padding-top:1.25rem;">
        Hyrox Training Club La Buse — Saint-Paul, La Réunion<br>
        <a href="https://hyrox-challenge-labuse.vercel.app/#accueil" style="color:#888;text-decoration:none;">hyrox-challenge-labuse.vercel.app</a>
      </p>
    </div>`;
}

export function getAgeCat(dob) {
  if (!dob) return null;
  const age = new Date().getFullYear() - parseInt(dob.split('-')[0]);
  if (age < 16) return null;
  if (age <= 24) return '16-24 ans';
  if (age <= 34) return '25-34 ans';
  if (age <= 44) return '35-44 ans';
  if (age <= 54) return '45-54 ans';
  return '55 ans et +';
}

export function getMoyenneAge(dobs) {
  const ages = dobs.filter(Boolean).map(d => new Date().getFullYear() - parseInt(d.split('-')[0]));
  if (ages.length === 0) return null;
  const moy = Math.round(ages.reduce((a, b) => a + b, 0) / ages.length);
  if (moy < 16) return null;
  if (moy <= 24) return '16-24 ans';
  if (moy <= 34) return '25-34 ans';
  if (moy <= 44) return '35-44 ans';
  if (moy <= 54) return '45-54 ans';
  return '55 ans et +';
}
export function isParentEnfantInscription(inscription) {
  if (!inscription) return false;
  const cat = (inscription.categorie || '').toLowerCase();
  return cat.indexOf('parent') !== -1 && cat.indexOf('enfant') !== -1;
}

export function buildParentEnfantEmailHtml(inscription, nomStripe, montantStripe) {
  // Fallback si aucune inscription en DB (paiement direct via lien Stripe sans formulaire)
  const noInscription = !inscription;
  const prenomParent = noInscription ? (nomStripe || '').split(' ')[0] || '' : (inscription.prenom || '');
  const nomParent = noInscription ? (nomStripe || '').split(' ').slice(1).join(' ') : (inscription.nom || '');
  const prenomEnfant = noInscription ? '' : (inscription.co1_prenom || '');
  const nomEnfant = noInscription ? '' : (inscription.co1_nom || '');
  const tshirtParent = noInscription ? '—' : (`${inscription.tshirt_taille || ''} ${inscription.tshirt_coupe || ''}`.trim() || '—');
  const tshirtEnfant = noInscription ? '—' : (inscription.co1_tshirt || '—');
  const montantPaye = noInscription ? (montantStripe || 68) : (inscription.prix || 68);
  const enfantBloc = noInscription
    ? `<tr><td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;" colspan="2"><em>Les informations de l'enfant (nom, t-shirt) seront ajoutées après contact avec l'organisation.</em></td></tr>`
    : `
          <tr><td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">Enfant</td><td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${prenomEnfant} ${nomEnfant}</td></tr>
          <tr><td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">T-shirt parent</td><td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${tshirtParent}</td></tr>
          <tr><td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">T-shirt enfant</td><td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${tshirtEnfant}</td></tr>`;

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
          ${enfantBloc}
          <tr><td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">Format</td><td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">Duo Parent + Enfant</td></tr>
          <tr><td style="padding:8px 0;color:#888;font-size:14px;">Montant payé</td><td style="padding:8px 0;color:#FFEE00;font-weight:800;text-align:right;font-size:16px;">${montantPaye} €</td></tr>
        </table>
      </div>
      <div style="margin-top:1.5rem;text-align:center;">
        <img src="https://hyrox-challenge-labuse.vercel.app/affiche-parcours-parent-enfant.jpg" alt="Le parcours Hyrox Parents/Enfants" style="max-width:100%;border-radius:12px;border:1px solid #222;display:block;margin:0 auto;">
      </div>
      <div style="background:#0d1400;border:1px solid #FFEE00;border-radius:12px;padding:1.25rem;margin-top:1.5rem;text-align:center;">
        <div style="color:#FFEE00;font-weight:800;font-size:14px;margin-bottom:8px;">📅 Samedi 27 juin 2026 — à partir de 14h</div>
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

export function buildEmailHtml(inscription, nomStripe, montantPaye) {
  if (!inscription) {
    return `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#fff;padding:2rem;border-radius:12px;">
        <div style="text-align:center;margin-bottom:1.5rem;">
          <h1 style="color:#FFEE00;margin:0;font-size:26px;">Hyrox Challenge <span style="color:#fff">La Buse</span></h1>
        </div>
        <h2 style="color:#FFEE00;margin-top:1.5rem;">Inscription confirmée ! 🎉</h2>
        <p style="color:#ccc;line-height:1.7;margin-top:1rem;">
          Bonjour ${nomStripe || ''},<br><br>
          Ton inscription au <strong style="color:#FFEE00;">Hyrox Challenge La Buse #3</strong> est bien confirmée !<br><br>
          📅 <strong>Dimanche 15 novembre 2026</strong><br>
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
  
  let categorieAge = null;
  if (isDuo || isRelais) {
    const dobs = [
      inscription.date_naissance,
      inscription.co1_date_naissance,
      inscription.co2_date_naissance,
      inscription.co3_date_naissance
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

  const packPhotoLine = inscription.pack_photo ? `
          <tr>
            <td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">📸 Pack photo</td>
            <td style="padding:8px 0;color:#1B7B49;font-weight:700;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">✅ Inclus</td>
          </tr>` : '';

  const contactUrgence = (inscription.contact_urgence_nom || inscription.contact_urgence_prenom || inscription.contact_urgence_tel)
    ? `${(inscription.contact_urgence_prenom || '').trim()} ${(inscription.contact_urgence_nom || '').trim()}${inscription.contact_urgence_tel ? ' · ' + inscription.contact_urgence_tel : ''}`.trim()
    : '—';

  // Ligne athlètes pour la share card : capitaine + coéquipiers
  const athletes = [`${prenom} ${nom}`.trim()];
  if (inscription.co1_prenom || inscription.co1_nom) athletes.push(`${(inscription.co1_prenom || '').trim()} ${(inscription.co1_nom || '').trim()}`.trim());
  if (inscription.co2_prenom || inscription.co2_nom) athletes.push(`${(inscription.co2_prenom || '').trim()} ${(inscription.co2_nom || '').trim()}`.trim());
  if (inscription.co3_prenom || inscription.co3_nom) athletes.push(`${(inscription.co3_prenom || '').trim()} ${(inscription.co3_nom || '').trim()}`.trim());
  const athletesHtml = athletes.map(a => `<div style="font-size:22px;font-weight:900;color:#fff;line-height:1.35;">${a}</div>`).join('');
  const equipeShareLine = inscription.nom_equipe
    ? `<div style="margin-top:10px;color:#FFEE00;font-size:15px;font-weight:700;">🏷 ${inscription.nom_equipe}</div>`
    : '';

  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#fff;padding:2rem;border-radius:12px;">
      <h2 style="color:#FFEE00;margin:0 0 1rem;font-size:22px;">Inscription confirmée ! 🎉</h2>
      <p style="color:#ccc;line-height:1.7;margin:0 0 1.5rem;">
        Bonjour <strong style="color:#fff;">${prenom}</strong>,<br>
        Ton inscription est bien confirmée. À très vite sur la ligne de départ ! 💪
      </p>

      <!-- ===== SHARE CARD (à screenshot & partager) ===== -->
      <div style="background:#0a0a0a;border:3px solid #FFEE00;border-radius:16px;padding:2rem 1.5rem;margin-bottom:1.5rem;text-align:center;">
        <div style="color:#FFEE00;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:800;margin-bottom:8px;">✨ Prêt·e pour</div>
        <div style="color:#fff;font-size:26px;font-weight:900;line-height:1.1;letter-spacing:-0.5px;">HYROX CHALLENGE</div>
        <div style="color:#FFEE00;font-size:26px;font-weight:900;line-height:1.1;letter-spacing:-0.5px;margin-bottom:14px;">LA BUSE #3</div>
        <div style="background:#FFEE00;color:#0a0a0a;display:inline-block;padding:8px 16px;border-radius:8px;font-weight:800;font-size:14px;letter-spacing:1px;margin-bottom:20px;">📅 DIMANCHE 15 NOVEMBRE 2026</div>
        <div style="border-top:1px solid rgba(255,238,0,0.35);padding-top:18px;">
          ${athletesHtml}
          ${equipeShareLine}
          <div style="margin-top:12px;background:#FFEE00;color:#0a0a0a;display:inline-block;padding:6px 14px;border-radius:6px;font-weight:800;font-size:13px;letter-spacing:1px;text-transform:uppercase;">${inscription.categorie || '—'}</div>
          <div style="margin-top:10px;color:#ccc;font-size:13px;">⏱ Objectif : <strong style="color:#FFEE00;">${inscription.temps_estime || '—'}</strong></div>
        </div>
        <div style="margin-top:16px;color:#888;font-size:11px;letter-spacing:1px;">🌐 hyrox-challenge-labuse.vercel.app</div>
      </div>
      <p style="color:#888;font-size:12px;text-align:center;margin:-4px 0 1.5rem;font-style:italic;">📸 Fais un screenshot ci-dessus et partage-le sur tes réseaux !</p>

      <!-- ===== INFOS PERSO (pour toi) ===== -->
      <div style="background:#111;border:1px solid #222;border-radius:12px;padding:1.25rem;margin-top:1rem;">
        <div style="color:#FFEE00;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">📋 Tes infos perso</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">T-shirt</td>
            <td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${tshirt || '—'}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">${labelAge}</td>
            <td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:14px;border-bottom:1px solid #1a1a1a;">${valAge}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#888;font-size:14px;border-bottom:1px solid #1a1a1a;">🚨 Contact urgence</td>
            <td style="padding:8px 0;color:#fff;font-weight:600;text-align:right;font-size:13px;border-bottom:1px solid #1a1a1a;">${contactUrgence}</td>
          </tr>
          ${packPhotoLine}
          <tr>
            <td style="padding:8px 0;color:#888;font-size:14px;">Montant payé</td>
            <td style="padding:8px 0;color:#FFEE00;font-weight:800;text-align:right;font-size:16px;">${montantPaye} €</td>
          </tr>
        </table>
        ${coequipiersHtml}
      </div>

      <div style="background:#1a1a00;border:1px solid #FFEE00;border-radius:12px;padding:1rem 1.25rem;margin-top:1rem;">
        <div style="color:#FFEE00;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">💳 Politique de remboursement</div>
        <div style="color:#ccc;font-size:13px;line-height:1.6;">
          <strong style="color:#fff;">Aucun remboursement</strong> ne sera effectué après l'inscription.<br>
          Tu peux cependant <strong style="color:#fff;">revendre ta place toi-même</strong> jusqu'au <strong style="color:#FFEE00;">mercredi 5 novembre 2026</strong> (10 jours avant l'événement). Dans ce cas, <strong style="color:#fff;">informe-nous</strong> par mail à <a href="mailto:htclabuse@gmail.com" style="color:#FFEE00;">htclabuse@gmail.com</a> pour transférer l'inscription (nouveau nom, catégorie d'âge, taille de t-shirt).
        </div>
      </div>

      <!-- CE QUI EST INCLUS · 5 blocs -->
      <div style="margin-top:1.5rem;">
        <div style="color:#FFEE00;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;text-align:center;">✨ Ce qui est inclus dans ton inscription</div>

        <div style="background:#111;border:1px solid #222;border-left:4px solid #FFEE00;border-radius:10px;padding:14px 16px;margin-bottom:10px;">
          <div style="color:#FFEE00;font-weight:900;font-size:14px;margin-bottom:4px;">👕 T-shirt offert à chaque athlète</div>
          <div style="color:#ccc;font-size:12px;line-height:1.5;">Le T-shirt officiel de l'événement est offert à tous les participants — taille et coupe choisies à l'inscription.</div>
        </div>

        <div style="background:#111;border:1px solid #222;border-left:4px solid #FFEE00;border-radius:10px;padding:14px 16px;margin-bottom:10px;">
          <div style="color:#FFEE00;font-weight:900;font-size:14px;margin-bottom:4px;">🏅 Patch finisher pour tous</div>
          <div style="color:#ccc;font-size:12px;line-height:1.5;">Chaque athlète qui franchit la ligne d'arrivée repart avec son patch exclusif Hyrox Challenge La Buse.</div>
        </div>

        <div style="background:#111;border:1px solid #222;border-left:4px solid #FFEE00;border-radius:10px;padding:14px 16px;margin-bottom:10px;">
          <div style="color:#FFEE00;font-weight:900;font-size:14px;margin-bottom:4px;">🏆 Plus de 40 podiums à décrocher</div>
          <div style="color:#ccc;font-size:12px;line-height:1.5;">Trophées + patchs podium répartis par catégorie et tranche d'âge — beaucoup de chances de repartir avec une récompense.</div>
        </div>

        <div style="background:#111;border:1px solid #222;border-left:4px solid #FFEE00;border-radius:10px;padding:14px 16px;margin-bottom:10px;">
          <div style="color:#FFEE00;font-weight:900;font-size:14px;margin-bottom:4px;">⭐ Qualif ELITE 12 <span style="font-size:10px;background:#FFEE00;color:#0a0a0a;padding:2px 6px;border-radius:4px;margin-left:4px;font-weight:800;letter-spacing:1px;">GRANDE FINALE 2027</span></div>
          <div style="color:#ccc;font-size:12px;line-height:1.5;">Les 12 meilleurs chronos par catégorie se qualifient pour la Grande Finale ELITE 12 en 2027.</div>
        </div>

        <div style="background:#111;border:1px solid #222;border-left:4px solid #FFEE00;border-radius:10px;padding:14px 16px;margin-bottom:10px;">
          <div style="color:#FFEE00;font-weight:900;font-size:14px;margin-bottom:4px;">⚡ Course 100 % digitalisée <span style="font-size:10px;background:#FFEE00;color:#0a0a0a;padding:2px 6px;border-radius:4px;margin-left:4px;font-weight:800;letter-spacing:1px;">UNIQUE À LA RÉUNION</span></div>
          <div style="color:#ccc;font-size:12px;line-height:1.5;">Classement en direct sur écran + téléphone, temps par atelier communiqué à chaque athlète, résultats en temps réel sur notre site.</div>
        </div>
      </div>

      <div style="background:#0d1400;border:1px solid #FFEE00;border-radius:12px;padding:1.25rem;margin-top:1.5rem;text-align:center;">
        <div style="color:#FFEE00;font-weight:800;font-size:14px;margin-bottom:8px;">📅 Dimanche 15 novembre 2026</div>
        <div style="color:#ccc;font-size:14px;">📍 Crossfit La Buse — Saint-Paul, La Réunion</div>
      </div>
      <div style="text-align:center;margin-top:1.5rem;">
        <a href="https://hyrox-challenge-labuse.vercel.app" style="background:#FFEE00;color:#0a0a0a;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:800;display:inline-block;">🌐 Toutes les infos sur notre site</a>
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
