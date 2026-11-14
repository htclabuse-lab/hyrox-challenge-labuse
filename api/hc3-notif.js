import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../lib/kids.js';

// ============================================================================
// Mails de notification HC #3 — deux modes :
//
// 1) VAGUE_CHANGE : prévient quelqu'un que son numéro de vague a changé.
//    POST { password, mode: 'vague_change', ids: [771, 318, ...], dry_run: true }
//    POST { password, mode: 'vague_change', ids: [...], test_to: 'x@y.fr' }
//    POST { password, mode: 'vague_change', ids: [...], envoyer: true }
//    Lit la vague/heure actuelle de chaque fiche dans la base (pas de donnée en entrée).
//
// 2) CATEGORIE_CHANGE : confirme un changement de catégorie (vague inchangée).
//    POST { password, mode: 'categorie_change', id: 680, ancienne_categorie: 'Solo Femme Scaled', test_to | envoyer }
//    Un seul destinataire.
//
// 3) VAGUES_CLOSED : mail générique à TOUS les inscrits HC #3 payés (hors PE).
//    « Vagues clôturées + rulebook à lire ». Dédoublonne par email (capitaine + co1/2/3).
//    POST { password, mode: 'vagues_closed', dry_run: true | test_to: 'x@y.fr' | envoyer: true }
// ============================================================================

const FROM = 'Hyrox Challenge La Buse <noreply@htclabuse.fr>';
const REPLY_TO = 'htclabuse@gmail.com';

function heureLocale(iso) {
  // 2026-11-15T04:30:00+00:00 → "08h30" (La Réunion = UTC+4)
  if (!iso) return '—';
  const h = parseInt(iso.substr(11, 2), 10);
  const m = iso.substr(14, 2);
  return `${(h + 4) % 24}h${m}`;
}

function mailVagueChange(fiche) {
  const prenom = (fiche.prenom || '').trim();
  const vague = fiche.vague;
  const h = heureLocale(fiche.heure_depart);
  return {
    subject: '⏱ Hyrox Challenge La Buse #3 — ta vague a changé',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + `<p>Salut <strong>${prenom}</strong>,</p>`
      + '<p>Petit ajustement de dernière minute sur l\'organisation des vagues HC #3 pour mieux équilibrer les catégories dans chaque départ.</p>'
      + '<p><strong>Ta nouvelle vague :</strong></p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:10px 0;border-radius:4px;">'
      + `<div style="font-size:20px;font-weight:800;color:#C0392B;">Vague ${vague} — ${h}</div>`
      + '<div style="font-size:13px;color:#666;margin-top:4px;">Dimanche 15 novembre 2026</div>'
      + '</div>'
      + '<p>C\'est le seul changement — ta catégorie, ton t-shirt et ton pack sont inchangés.</p>'
      + '<p>Désolé pour la petite modif, et à très vite ! 💛🖤</p>'
      + '<p><strong>Stéphanie &amp; l\'équipe La Buse</strong></p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailCategorieChange(fiche, ancienne) {
  const prenom = (fiche.prenom || '').trim();
  const h = heureLocale(fiche.heure_depart);
  return {
    subject: '✅ Hyrox Challenge La Buse #3 — ta catégorie est modifiée',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + `<p>Salut <strong>${prenom}</strong>,</p>`
      + '<p>C\'est bien noté, ton changement de catégorie est fait :</p>'
      + '<div style="background:#E8F5E9;border-left:4px solid #4caf50;padding:14px 18px;margin:10px 0;border-radius:4px;">'
      + `<div style="font-size:15px;color:#666;text-decoration:line-through;">${ancienne}</div>`
      + `<div style="font-size:20px;font-weight:800;color:#2e7d32;">→ ${fiche.categorie}</div>`
      + '</div>'
      + '<p>Ta vague et ton horaire restent les mêmes :</p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:10px 0;border-radius:4px;">'
      + `<div style="font-size:18px;font-weight:800;color:#C0392B;">Vague ${fiche.vague} — ${h}</div>`
      + '<div style="font-size:13px;color:#666;margin-top:4px;">Dimanche 15 novembre 2026</div>'
      + '</div>'
      + '<p>À très vite pour l\'événement ! 💛🖤</p>'
      + '<p><strong>Stéphanie &amp; l\'équipe La Buse</strong></p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailBenevolesRulebook(prenom) {
  const salut = prenom ? `Salut <strong>${prenom}</strong>,` : 'Salut à toi,';
  return {
    subject: '🙌 HC #3 — merci d\'être bénévole ! Lis le rulebook pour tout comprendre',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + `<p>${salut}</p>`
      + '<p>Merci encore d\'avoir répondu présent·e pour nous aider sur le <strong>Hyrox Challenge La Buse #3</strong> ce dimanche 15 novembre 2026 ! 💛🖤</p>'
      + '<p>Pour que tu sois à l\'aise sur ton poste, il est <strong>important que tu lises le rulebook de la course</strong> : tu y trouveras les règles de chaque station, les pénalités, les standards de mouvement et le fonctionnement général de l\'événement. Ça te permettra de bien comprendre ce que font les athlètes et de répondre à leurs questions.</p>'
      + '<p>👉 <a href="https://hyrox-challenge-labuse.vercel.app/rulebook.html">https://hyrox-challenge-labuse.vercel.app/rulebook.html</a></p>'
      + '<p>On t\'enverra bientôt les derniers détails logistiques (lieu de rendez-vous, horaires exacts selon ta dispo).</p>'
      + '<p>À très vite ! 🫶</p>'
      + '<p><strong>Stéphanie &amp; l\'équipe La Buse</strong></p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailBenevolesLienJuge(prenom) {
  const salut = prenom ? `Salut <strong>${prenom}</strong>,` : 'Salut à toi,';
  return {
    subject: '🧑‍⚖️ HC #3 demain — ton lien juge + mot de passe',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + `<p>${salut}</p>`
      + '<p>C\'est demain ! 🎉 Merci encore d\'être là pour nous aider sur le <strong>Hyrox Challenge La Buse #3</strong>.</p>'
      + '<p>Voici tout ce dont tu as besoin pour ton poste de <strong>juge/starter</strong> :</p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:14px 0;border-radius:4px;">'
      + '<p style="margin:0 0 8px;"><strong>🔗 Lien juge :</strong><br><a href="https://hyrox-challenge-labuse.vercel.app/juge.html" style="color:#C0392B;font-weight:800;">hyrox-challenge-labuse.vercel.app/juge.html</a></p>'
      + '<p style="margin:0;"><strong>🔐 Mot de passe :</strong> <code style="background:#fff;padding:2px 10px;border-radius:4px;font-size:16px;font-weight:800;">Romu</code></p>'
      + '</div>'
      + '<p><strong>Mode d\'emploi (30 s) :</strong></p>'
      + '<ol style="padding-left:20px;margin:0 0 14px;">'
      + '<li>Ouvre le lien sur ton téléphone <strong>le jour J</strong> (pas la peine d\'enregistrer l\'appli).</li>'
      + '<li>Saisis le mot de passe <strong>Romu</strong>.</li>'
      + '<li>Choisis ton <strong>poste</strong> : « 🏁 Départ (Starter) » ou une des 8 stations (SkiErg, Sled Push, Sled Pull, Burpee BJ, Rowing, Farmer\'s Carry, Sandbag Lunges, Wall Balls).</li>'
      + '<li>C\'est parti : tu n\'as plus qu\'à valider les athlètes qui passent à ton poste.</li>'
      + '</ol>'
      + '<p>👉 <strong>Avant de venir, relis le rulebook</strong> pour maîtriser les règles de ta station : <a href="https://hyrox-challenge-labuse.vercel.app/rulebook.html">rulebook complet ici</a></p>'
      + '<p>Si tu as un doute sur un mouvement ou une pénalité, demande-nous sur place — on sera toujours à proximité pour t\'épauler.</p>'
      + '<p>Un ÉNORME merci 🫶. À demain !</p>'
      + '<p><strong>Stéphanie &amp; l\'équipe La Buse</strong> 💛🖤</p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailRetraitPack(prenom) {
  const salut = prenom ? `Salut <strong>${prenom}</strong>,` : 'Salut à toi,';
  return {
    subject: '📦 Retrait des packs athlètes — HC #3 & Parent-Enfant #2',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + `<p>${salut}</p>`
      + '<p>L\'événement approche ! Voici les infos pour récupérer ton pack athlète.</p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:14px 0;border-radius:4px;">'
      + '<p style="margin:0 0 6px;font-size:16px;font-weight:800;color:#C0392B;">✨ Retrait anticipé — Vendredi 13 novembre à partir de 15h</p>'
      + '<p style="margin:0;">Chez <strong>Intersport Le Port</strong></p>'
      + '</div>'
      + '<div style="background:#E8F5E9;border-left:4px solid #4caf50;padding:14px 18px;margin:14px 0;border-radius:4px;">'
      + '<p style="margin:0 0 8px;font-weight:800;">🎁 Bonus partenaire Intersport sur présentation de ton pack/dossard en caisse :</p>'
      + '<ul style="margin:0;padding-left:20px;">'
      + '<li><strong>-20%</strong> sur les vêtements et chaussures running</li>'
      + '<li><strong>-10%</strong> sur les équipements (sacs, chaussettes, compressions)</li>'
      + '</ul>'
      + '<p style="margin:8px 0 0;font-size:12px;color:#666;">(hors promos en cours, hors soldes, offre non cumulable, pas sur la nutrition / électronique / frontales)</p>'
      + '</div>'
      + '<p><strong>Sinon : retrait le jour de ta course</strong><br>Sur place au CrossFit La Buse, selon ton horaire de passage :</p>'
      + '<ul style="padding-left:20px;margin:0 0 14px;">'
      + '<li><strong>Samedi 14 novembre</strong> pour le Parent-Enfant #2</li>'
      + '<li><strong>Dimanche 15 novembre</strong> pour le Hyrox Challenge #3</li>'
      + '</ul>'
      + '<p>À très vite 🔥</p>'
      + '<p><strong>Hyrox Training Club La Buse</strong><br>Maryan, Romuald et Stéphanie</p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailVaguesClosed(prenom) {
  const salut = prenom ? `Salut <strong>${prenom}</strong>,` : 'Salut à toi,';
  return {
    subject: '🏁 Hyrox Challenge La Buse #3 — vagues clôturées + rulebook (impératif)',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + `<p>${salut}</p>`
      + '<p>Plus que quelques jours avant le <strong>Hyrox Challenge La Buse #3</strong> (dimanche 15 novembre 2026) !</p>'
      + '<p><strong>⚠️ Les vagues sont désormais clôturées et finalisées.</strong> Plus aucun changement d\'horaire ne sera possible d\'ici dimanche. Vérifie une dernière fois ta <strong>vague et ton heure de départ</strong> (onglet « À venir » → section Vagues, recherche par nom ou équipe) :<br>👉 <a href="https://hyrox-challenge-labuse.vercel.app/#vagues">https://hyrox-challenge-labuse.vercel.app/#vagues</a></p>'
      + '<p><strong>📘 LIRE LE RULEBOOK EST IMPÉRATIF.</strong> Règles du format, standards de mouvement, logistique, zones, horaires — tout y est. Prends 10 minutes, c\'est le meilleur investissement avant la course :<br>👉 <a href="https://hyrox-challenge-labuse.vercel.app/rulebook.html">https://hyrox-challenge-labuse.vercel.app/rulebook.html</a></p>'
      + '<p>On a hâte de te voir dimanche. En attendant : repos, hydratation, et pas de PR la veille 😉</p>'
      + '<p><strong>Stéphanie &amp; l\'équipe La Buse</strong> 💛🖤</p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailBenevolesPlacement(b) {
  const prenom = (b.prenom || '').trim() || 'cher bénévole';
  const sm = b.station_matin;
  const sa = b.station_aprem;
  const pause = b.pause_creneau;
  const r11 = b.remplace_11h30;

  const matinHTML = sm
    ? `<p style="margin:10px 0;">🌅 <strong>Matin (7h30 - 13h)</strong><br>→ Station : <strong>${sm}</strong>${r11 ? '<br><em style="color:#C0392B">À noter : ' + r11 + '</em>' : ''}</p>`
    : `<p style="margin:10px 0;">🌅 <strong>Matin (7h30 - 13h)</strong><br>→ Rôle flottant·e${r11 ? '<br><em style="color:#C0392B">À noter : ' + r11 + '</em>' : ' — précisions au briefing'}</p>`;
  const apremHTML = `<p style="margin:10px 0;">🌇 <strong>Après-midi (13h - 18h)</strong><br>→ Station : <strong>${sa || '—'}</strong></p>`;
  const pauseHTML = pause ? `<p style="margin:10px 0;">🥪 <strong>Pause déjeuner : ${pause}</strong></p>` : '';

  return {
    subject: '🙌 Ton poste bénévole pour Hyrox Challenge La Buse #3 — Dimanche 15 novembre',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + `<p>Bonjour <strong>${prenom}</strong>,</p>`
      + '<p>Merci mille fois de donner de ton temps pour cette édition #3 de l\'Hyrox Challenge La Buse ! On a hâte de te voir dimanche.</p>'
      + '<p><strong>Voici ton poste pour la journée :</strong></p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:14px 0;border-radius:4px;">'
      + matinHTML
      + apremHTML
      + pauseHTML
      + '</div>'
      + '<p>⏰ <strong>Il est crucial de respecter ces horaires.</strong> L\'organisation tourne comme une horloge : chaque station doit rester couverte en permanence pour que tes collègues puissent partir en pause à leur tour.</p>'
      + '<p>❄️ Pendant ta pause, <strong>un espace climatisé</strong> sera à ta disposition pour manger et te poser au calme.</p>'
      + '<p>Rendez-vous <strong>à 7h15</strong> au CrossFit La Buse pour un briefing rapide avant le début de la course à 8h.</p>'
      + '<p>À dimanche ! 💪</p>'
      + '<p><strong>Hyrox Training Club La Buse</strong><br>Maryan, Romuald et Stéphanie</p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailBenevoleLoicRenfortSP() {
  return {
    subject: '🙌 Ton rôle bénévole — Renfort Sled Pull + SkiErg HC #3',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + '<p>Bonjour <strong>Loïc</strong>,</p>'
      + '<p>Merci pour ton implication en plus de ta course !</p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:14px 0;border-radius:4px;">'
      + '<p style="margin:10px 0;">🕖 <strong>Arrivée : 7h15</strong> au CrossFit La Buse (briefing)</p>'
      + '<p style="margin:10px 0;">💪 <strong>Matin (7h30 - ta vague) : RENFORT SLED PULL</strong><br>Tu viens prêter main forte à l\'équipe Sled Pull pour couvrir la matinée.</p>'
      + '<p style="margin:10px 0;">🏃 <strong>10h45 : ta course</strong> (vague 17)</p>'
      + '<p style="margin:10px 0;">🌇 <strong>Après-midi (13h - 18h) : SkiErg</strong><br>Tu nous rejoins à 13h après ta course et ta récup.</p>'
      + '<p style="margin:10px 0;">🥪 <strong>Pause :</strong> ta course sert de coupure naturelle — pas de créneau pause formel.</p>'
      + '</div>'
      + '<p>⏰ <strong>Important de respecter 7h30</strong> pour l\'équipe Sled Pull.</p>'
      + '<p>❄️ Espace climatisé dispo pour manger.</p>'
      + '<p><strong>Hyrox Training Club La Buse</strong><br>Maryan, Romuald et Stéphanie</p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailBenevoleDavidRenfortOrga() {
  return {
    subject: '🙌 Ton rôle bénévole — Renfort organisation + Lunges HC #3',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + '<p>Bonjour <strong>David</strong>,</p>'
      + '<p>Merci mille fois pour ton implication pour cette édition #3 !</p>'
      + '<p><strong>Voici ton rôle pour dimanche :</strong></p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:14px 0;border-radius:4px;">'
      + '<p style="margin:10px 0;">🕖 <strong>Arrivée : 7h15</strong> au CrossFit La Buse (briefing)</p>'
      + '<p style="margin:10px 0;">🔧 <strong>Matin (7h30 - 13h) : RENFORT ORGANISATION</strong><br>Entre <strong>11h et 13h</strong>, tu couvres la station <strong>Sled Pull</strong> pendant que les titulaires prennent leur pause déjeuner.</p>'
      + '<p style="margin:10px 0;">🌇 <strong>Après-midi (13h - 18h) : RENFORT ZONE LUNGES</strong><br>Tu es sur la station <strong>Lunges</strong> — on manque de bénévoles cet aprem, donc tu juges activement pour épauler l\'équipe.</p>'
      + '<p style="margin:10px 0;">🥪 <strong>Pause :</strong> à prendre librement sur place (pas de créneau fixe)</p>'
      + '</div>'
      + '<p>⏰ Tu es un rouage clé — merci à toi !</p>'
      + '<p>❄️ Espace climatisé dispo pour manger.</p>'
      + '<p><strong>Hyrox Training Club La Buse</strong><br>Maryan, Romuald et Stéphanie</p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailBenevoleKarineCoordination() {
  return {
    subject: '🙌 Ton programme journée (mise à jour) — HC #3',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + '<p>Bonjour <strong>Karine</strong>,</p>'
      + '<p>Désolée pour cet énième mail de modification 🙈 — voici ton programme <strong>mis à jour</strong> pour dimanche :</p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:14px 0;border-radius:4px;">'
      + '<p style="margin:10px 0;">🕖 <strong>Arrivée : 7h00</strong> au CrossFit La Buse</p>'
      + '<p style="margin:10px 0;">👥 <strong>Matin (7h30 - 11h) : COORDINATION BÉNÉVOLES + RENFORT ORGANISATION</strong><br>Tu es notre <strong>garante du bon placement des bénévoles</strong> — tu t\'assures que chacun est bien à sa station et qu\'ils ont compris leurs horaires de pause.</p>'
      + '<p style="margin:10px 0;">🔁 <strong>11h - 13h : Sled Push</strong> (renfort pauses des titulaires)</p>'
      + '<p style="margin:10px 0;">🥪 <strong>Pause déjeuner :</strong> soit tu <strong>manges avant 11h</strong>, soit tu nous préviens par message (Steph, Stérenn ou Maryan) quand tu veux prendre ta pause et on te couvre. On ne te prévoit pas de créneau fixe.</p>'
      + '<p style="margin:10px 0;">🌇 <strong>Après-midi (13h - 18h) : RENFORT ZONE WALL BALL / BURPEES</strong><br>Tu circules entre les deux stations — on manque de bénévoles cet aprem. Tu juges dès que besoin pour épauler les équipes.</p>'
      + '</div>'
      + '<p><strong>🔗 Liens utiles :</strong><br>'
      + '• Planning complet par station : <a href="https://hyrox-challenge-labuse.vercel.app/planning-vue.html">planning-vue.html</a><br>'
      + '• Rechercher un bénévole par prénom : <a href="https://hyrox-challenge-labuse.vercel.app/mon-poste-benevole.html">mon-poste-benevole.html</a></p>'
      + '<p>📋 Je vais aussi <strong>imprimer le planning complet</strong> pour que tu l\'aies en papier le jour J.</p>'
      + '<p>❄️ Espace climatisé dispo.</p>'
      + '<p>⏰ Tu es un rouage clé — merci à toi !</p>'
      + '<p><strong>Hyrox Training Club La Buse</strong><br>Maryan, Romuald et Stéphanie</p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailBenevoleSterennAccueil() {
  return {
    subject: '🙌 Ton poste bénévole — Accueil HC #3',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + '<p>Bonjour <strong>Stérenn</strong>,</p>'
      + '<p>Merci pour ton engagement journée entière !</p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:14px 0;border-radius:4px;">'
      + '<p style="margin:10px 0;">🕖 <strong>Arrivée : 7h15</strong> au CrossFit La Buse (briefing)</p>'
      + '<p style="margin:10px 0;">🌅 <strong>Matin (7h30 - 13h) : Accueil</strong></p>'
      + '<p style="margin:10px 0;">🌇 <strong>Après-midi (13h - 18h) : Accueil</strong></p>'
      + '</div>'
      + '<p>Vu la nature de ton poste, <strong>pas de créneau pause formel</strong> attribué. Avec Steph qui est aussi à l\'Accueil, vous pouvez vous relayer librement pour manger sur place.</p>'
      + '<p>❄️ Espace climatisé juste à côté pour grignoter.</p>'
      + '<p><strong>Hyrox Training Club La Buse</strong><br>Maryan, Romuald et Stéphanie</p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailBenevoleDemiMatin(prenom, station) {
  return {
    subject: '🙌 Ton poste bénévole pour Hyrox Challenge La Buse #3 — Dimanche 15 novembre (matin)',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + `<p>Bonjour <strong>${prenom || 'cher bénévole'}</strong>,</p>`
      + '<p>Merci mille fois de donner de ton temps pour cette édition #3 de l\'Hyrox Challenge La Buse !</p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:14px 0;border-radius:4px;">'
      + '<p style="margin:10px 0;">🕖 <strong>Arrivée : 7h15</strong> au CrossFit La Buse (briefing)</p>'
      + `<p style="margin:10px 0;">🌅 <strong>Shift matin (7h30 - 13h) : ${station}</strong></p>`
      + '</div>'
      + '<p>⏰ <strong>Ta ponctualité est cruciale.</strong> Les bénévoles journée comptent sur toi pour pouvoir partir en pause à leur tour — on ne peut laisser aucune station sans personne. Chaque minute compte pour que l\'organisation tourne.</p>'
      + '<p>🙏 Merci pour ton engagement, on compte vraiment sur toi.</p>'
      + '<p>❄️ Espace climatisé dispo avant ou après ton shift.</p>'
      + '<p><strong>Hyrox Training Club La Buse</strong><br>Maryan, Romuald et Stéphanie</p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailBenevoleDemiAprem(prenom, station) {
  return {
    subject: '🙌 Ton poste bénévole pour Hyrox Challenge La Buse #3 — Dimanche 15 novembre (après-midi)',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + `<p>Bonjour <strong>${prenom || 'cher bénévole'}</strong>,</p>`
      + '<p>Merci mille fois de donner de ton temps pour cette édition #3 de l\'Hyrox Challenge La Buse !</p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:14px 0;border-radius:4px;">'
      + '<p style="margin:10px 0;">🕐 <strong>Arrivée : 12h45</strong> au CrossFit La Buse (prise de poste)</p>'
      + `<p style="margin:10px 0;">🌇 <strong>Shift aprem (13h - 18h) : ${station}</strong></p>`
      + '</div>'
      + '<p>⏰ <strong>Ta ponctualité est cruciale.</strong> Les bénévoles du matin comptent sur toi pour pouvoir partir à leur tour — on ne peut laisser aucune station sans personne. Chaque minute compte pour que l\'organisation tourne.</p>'
      + '<p>🙏 Merci pour ton engagement, on compte vraiment sur toi.</p>'
      + '<p>❄️ Espace climatisé dispo avant ou après ton shift.</p>'
      + '<p><strong>Hyrox Training Club La Buse</strong><br>Maryan, Romuald et Stéphanie</p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailBenevolesPE2(prenom) {
  return {
    subject: '🙌 Ton poste bénévole — Parent-Enfant La Buse #2 (samedi 14 novembre)',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + `<p>Bonjour <strong>${prenom || 'cher bénévole'}</strong>,</p>`
      + '<p>Merci mille fois de donner de ton temps pour l\'édition #2 du <strong>Parent-Enfant La Buse</strong> ! C\'est une journée très attendue des familles et chaque bénévole compte.</p>'
      + '<p><strong>Voici tes infos pour samedi :</strong></p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:14px 0;border-radius:4px;">'
      + '<p style="margin:10px 0;">🕛 <strong>Arrivée : 12h</strong> au CrossFit La Buse (briefing)</p>'
      + '<p style="margin:10px 0;">🏁 <strong>Début des vagues : 12h30</strong></p>'
      + '<p style="margin:10px 0;">🏁 <strong>Dernière vague : 15h30</strong></p>'
      + '<p style="margin:10px 0;">🎯 <strong>Fin de mission : ~16h30 - 17h</strong> (après la dernière course et le rangement)</p>'
      + '</div>'
      + '<p>⏰ <strong>Ta ponctualité est cruciale.</strong> Chaque station doit rester couverte pour que l\'événement tourne — on compte vraiment sur toi pour arriver à l\'heure.</p>'
      + '<p>🙏 Un <strong>immense merci</strong> pour ton engagement ❤️</p>'
      + '<p>📩 N\'hésite pas à <strong>répondre directement à ce mail</strong> pour toute question ou changement.</p>'
      + '<p>À samedi ! 💪</p>'
      + '<p><strong>Hyrox Training Club La Buse</strong><br>Maryan, Romuald et Stéphanie</p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailBenevoleLorisWallBall() {
  return {
    subject: '🙌 Ton poste bénévole — Wall Ball après-midi HC #3',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + '<p>Bonjour <strong>Loris</strong>,</p>'
      + '<p>Merci pour ton implication en plus de ta course !</p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:14px 0;border-radius:4px;">'
      + '<p style="margin:10px 0;">🏃 <strong>Matin :</strong> ta course (vague 100 à <strong>11h15</strong>)</p>'
      + '<p style="margin:10px 0;">🌇 <strong>Après-midi (13h - 18h) : WALL BALL</strong></p>'
      + '</div>'
      + '<p>J\'espère que tu seras <strong>frais pour 13h</strong> au Wall Ball 💪</p>'
      + '<p>🕐 Prise de poste à 13h directement.</p>'
      + '<p>❄️ Espace climatisé dispo avant ou après ton shift.</p>'
      + '<p><strong>Hyrox Training Club La Buse</strong><br>Maryan, Romuald et Stéphanie</p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailBenevoleMichelRenfortMatin() {
  return {
    subject: '🙌 Bienvenue Michel — Ton rôle bénévole HC #3',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + '<p>Bonjour <strong>Michel</strong>,</p>'
      + '<p>Merci de rejoindre l\'équipe bénévole au dernier moment, c\'est super !</p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:14px 0;border-radius:4px;">'
      + '<p style="margin:10px 0;">🕖 <strong>Arrivée : 7h15</strong> au CrossFit La Buse (briefing)</p>'
      + '<p style="margin:10px 0;">🌅 <strong>Matin (7h30 - 11h) : RENFORT / VOLANT</strong><br>Tu te présentes à Karine (coordinatrice matin) qui te placera là où on a besoin, en fonction des besoins du moment.</p>'
      + '<p style="margin:10px 0;">🥪 <strong>Pause : 11h - 12h</strong></p>'
      + '<p style="margin:10px 0;">🔁 <strong>12h - 13h : remplacement de Karine au Sled Push</strong> (renfort pauses sur la station) pendant sa pause déjeuner.</p>'
      + '<p style="margin:10px 0;">🌇 <strong>Après-midi (13h - 18h) : BURPEES</strong></p>'
      + '</div>'
      + '<p>⏰ <strong>La ponctualité est cruciale</strong> : si une station se vide, les athlètes sont bloqués et les bénévoles journée ne peuvent pas prendre leur pause. On compte sur toi pour respecter les horaires 🙏</p>'
      + '<p>❄️ Un espace climatisé est à disposition avant ou après ton shift.</p>'
      + '<p>📩 Une question ou un changement ? Réponds directement à ce mail.</p>'
      + '<p>Merci encore, on compte sur toi !</p>'
      + '<p><strong>Hyrox Training Club La Buse</strong><br>Maryan, Romuald et Stéphanie</p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailBenevoleCamilleLungesAprem() {
  return {
    subject: '🙌 Bienvenue Camille — Ton poste bénévole HC #3',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + '<p>Bonjour <strong>Camille</strong>,</p>'
      + '<p>Merci de rejoindre l\'équipe bénévole au dernier moment, c\'est super !</p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:14px 0;border-radius:4px;">'
      + '<p style="margin:10px 0;">🕐 <strong>Arrivée : 12h45</strong> au CrossFit La Buse (prise de poste)</p>'
      + '<p style="margin:10px 0;">🌇 <strong>Après-midi (13h - 18h) : LUNGES (Fentes)</strong></p>'
      + '</div>'
      + '<p>⏰ <strong>La ponctualité est cruciale</strong> : si une station se vide, les athlètes sont bloqués et les bénévoles journée ne peuvent pas prendre leur pause. On compte sur toi pour respecter les horaires 🙏</p>'
      + '<p>❄️ Un espace climatisé est à disposition avant ou après ton shift.</p>'
      + '<p>📩 Une question ou un changement ? Réponds directement à ce mail.</p>'
      + '<p>Merci encore, on compte sur toi !</p>'
      + '<p><strong>Hyrox Training Club La Buse</strong><br>Maryan, Romuald et Stéphanie</p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailBenevoleDanyRenfortBurpees() {
  return {
    subject: '🙌 Ton rôle bénévole — Renfort Burpees HC #3',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + '<p>Bonjour <strong>Dany</strong>,</p>'
      + '<p>Merci pour ton implication en plus de ta course !</p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:14px 0;border-radius:4px;">'
      + '<p style="margin:10px 0;">🕖 <strong>Arrivée : 7h15</strong> au CrossFit La Buse (briefing)</p>'
      + '<p style="margin:10px 0;">🤸 <strong>Matin (7h30 - ta vague) : RENFORT BURPEES</strong><br>Tu viens prêter main forte à l\'équipe Burpees pour couvrir la matinée.</p>'
      + '<p style="margin:10px 0;">🏃 <strong>11h05 : ta course</strong> (vague 19)</p>'
      + '<p style="margin:10px 0;color:#666;">Après ta course, tu es libre.</p>'
      + '</div>'
      + '<p>⏰ <strong>Important de respecter 7h30</strong> pour que l\'équipe Burpees puisse s\'organiser avec toi.</p>'
      + '<p>❄️ Espace climatisé dispo.</p>'
      + '<p><strong>Hyrox Training Club La Buse</strong><br>Maryan, Romuald et Stéphanie</p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailBenevoleSabineWallBall() {
  return {
    subject: '🙌 Bienvenue Sabine — Ton poste bénévole HC #3',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + '<p>Bonjour <strong>Sabine</strong>,</p>'
      + '<p>Bienvenue sur le <strong>Hyrox Challenge La Buse #3</strong> ! Merci beaucoup de rejoindre l\'équipe bénévole au dernier moment, ton aide va vraiment compter 🙌</p>'
      + '<div style="background:#FFF8E1;border-left:4px solid #FFA726;padding:14px 18px;margin:14px 0;border-radius:4px;">'
      + '<p style="margin:10px 0;">🕐 <strong>Arrivée : 12h</strong> au CrossFit La Buse</p>'
      + '<p style="margin:10px 0;">📍 <strong>Passe d\'abord à l\'Accueil</strong> pour te présenter — on te briefera et t\'orientera vers ton poste.</p>'
      + '<p style="margin:10px 0;">🏋️ <strong>Ton poste : WALL BALL</strong></p>'
      + '<p style="margin:10px 0;color:#444;">— <strong>12h - 13h</strong> : renfort Wall Ball pendant la pause déjeuner de l\'équipe</p>'
      + '<p style="margin:10px 0;color:#444;">— <strong>13h - 18h</strong> : titulaire Wall Ball</p>'
      + '</div>'
      + '<p>👕 <strong>Petit mot sur le t-shirt :</strong> comme ton inscription est arrivée au dernier moment, nous n\'avons pas pu te commander ton t-shirt bénévole 😔 Désolés ! Si tu peux venir avec un <strong>haut blanc</strong>, ça permettra au staff et aux athlètes de te repérer facilement.</p>'
      + '<p>⏰ <strong>La ponctualité est cruciale</strong> : si une station se vide, les athlètes sont bloqués. On compte sur toi pour respecter 12h 🙏</p>'
      + '<p>❄️ Un espace climatisé est à disposition avant ou après ton shift.</p>'
      + '<p>📩 Une question ou un changement ? Réponds directement à ce mail.</p>'
      + '<p>Merci encore pour ton engagement, on a hâte de te rencontrer demain !</p>'
      + '<p><strong>Hyrox Training Club La Buse</strong><br>Maryan, Romuald et Stéphanie</p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
}

function mailBenevolesRappelAccueil(prenom) {
  const salut = prenom ? `Bonjour <strong>${prenom}</strong>,` : 'Bonjour,';
  return {
    subject: '📍 HC #3 demain — Passe à l\'Accueil en arrivant',
    html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">'
      + '<p>' + salut + '</p>'
      + '<p>Petit rappel important pour demain 🙌</p>'
      + '<div style="background:#E8F5E9;border-left:4px solid #1B7B49;padding:14px 18px;margin:14px 0;border-radius:4px;">'
      + '<p style="margin:10px 0;">📍 <strong>En arrivant, passe à l\'Accueil</strong> pour te checker.</p>'
      + '<p style="margin:10px 0;color:#444;">C\'est important : ça nous permet de <strong>savoir qui est bien présent</strong> et de réorganiser les stations immédiatement si quelqu\'un manque à l\'appel.</p>'
      + '</div>'
      + '<p>📱 <strong>Viens avec ton téléphone chargé</strong> — tout se fera sur application (pointage des athlètes à chaque station).</p>'
      + '<p>⏰ <strong>La ponctualité est cruciale</strong> : si une station se vide, les athlètes sont bloqués et les bénévoles journée ne peuvent pas prendre leur pause.</p>'
      + '<p>❄️ Un espace climatisé est à disposition avant ou après ton shift.</p>'
      + '<p>Merci encore pour ton engagement, à demain !</p>'
      + '<p><strong>Hyrox Training Club La Buse</strong><br>Maryan, Romuald et Stéphanie</p>'
      + '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">'
      + '<p style="font-size:13px;color:#666;">Site de l\'événement : <a href="https://hyrox-challenge-labuse.vercel.app/#accueil">https://hyrox-challenge-labuse.vercel.app/#accueil</a></p>'
      + '</div>'
  };
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
  if (!process.env.JUGES_PASSWORD || b.password !== process.env.JUGES_PASSWORD) return res.status(401).json({ error: 'Mot de passe incorrect' });
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!serviceKey || !resendKey) return res.status(500).json({ error: 'Configuration serveur incomplète' });

  const db = createClient(SUPABASE_URL, serviceKey);

  try {
    if (b.mode === 'vague_change') {
      const ids = (b.ids || []).map(Number).filter(Boolean);
      if (!ids.length) return res.status(400).json({ error: 'ids vide' });
      const { data, error } = await db.from('Inscriptions')
        .select('id,prenom,nom,email,vague,heure_depart,categorie')
        .in('id', ids);
      if (error) return res.status(500).json({ error: error.message });
      const fiches = (data || []).filter(r => r.email && r.vague);
      const sansEmail = (data || []).filter(r => !r.email).map(r => `#${r.id} ${r.prenom} ${r.nom}`);

      if (b.test_to) {
        const n = await resendBatch(resendKey,
          [{ from: FROM, to: String(b.test_to).trim(), reply_to: REPLY_TO, ...mailVagueChange(fiches[0]) }],
          `hc3-vague-test-${Date.now()}`);
        return res.status(200).json({ test: true, envoyes: n, nb_destinataires_reels: fiches.length, exemple_fiche: fiches[0] });
      }
      if (b.envoyer !== true) {
        return res.status(200).json({
          dry_run: true, nombre: fiches.length, sans_email: sansEmail,
          destinataires: fiches.map(r => ({ id: r.id, nom: r.prenom + ' ' + r.nom, email: r.email, vague: r.vague, heure: heureLocale(r.heure_depart) })),
        });
      }
      let envoyes = 0;
      for (let i = 0; i < fiches.length; i += 100) {
        envoyes += await resendBatch(resendKey,
          fiches.slice(i, i + 100).map(r => ({ from: FROM, to: r.email, reply_to: REPLY_TO, ...mailVagueChange(r) })),
          `hc3-vague-${fiches.slice(i, i + 100).map(r => r.id).sort().join('-')}`);
      }
      return res.status(200).json({ envoye: true, nombre: fiches.length, envoyes, sans_email: sansEmail });
    }

    if (b.mode === 'categorie_change') {
      const id = Number(b.id);
      const ancienne = String(b.ancienne_categorie || '').trim();
      if (!id || !ancienne) return res.status(400).json({ error: 'id et ancienne_categorie requis' });
      const { data, error } = await db.from('Inscriptions')
        .select('id,prenom,nom,email,vague,heure_depart,categorie').eq('id', id).single();
      if (error) return res.status(500).json({ error: error.message });
      if (!data || !data.email) return res.status(404).json({ error: 'Fiche introuvable ou sans email' });

      if (b.test_to) {
        const n = await resendBatch(resendKey,
          [{ from: FROM, to: String(b.test_to).trim(), reply_to: REPLY_TO, ...mailCategorieChange(data, ancienne) }],
          `hc3-cat-test-${Date.now()}`);
        return res.status(200).json({ test: true, envoyes: n, fiche: data });
      }
      if (b.envoyer !== true) {
        return res.status(200).json({ dry_run: true, fiche: data, ancienne });
      }
      const n = await resendBatch(resendKey,
        [{ from: FROM, to: data.email, reply_to: REPLY_TO, ...mailCategorieChange(data, ancienne) }],
        `hc3-cat-${id}-v1`);
      return res.status(200).json({ envoye: true, envoyes: n, to: data.email });
    }

    if (b.mode === 'vagues_closed') {
      // Mail générique à TOUS les inscrits HC #3 payés (15/11, hors PE).
      // Flatten capitaine + co1/2/3 → dédoublonne par email.
      const { data, error } = await db.from('Inscriptions')
        .select('id,prenom,nom,email,co1_prenom,co1_nom,co1_email,co2_prenom,co2_nom,co3_prenom,co3_nom,categorie,heure_depart,statut_paiement')
        .gte('heure_depart', '2026-11-15').lt('heure_depart', '2026-11-16')
        .neq('categorie', 'Parent-Enfant')
        .eq('statut_paiement', 'paye');
      if (error) return res.status(500).json({ error: error.message });
      const EXCLUS = ['stephanie.caro31@gmail.com'];
      const parEmail = {};
      (data || []).forEach(ins => {
        const push = (prenom, email) => {
          const e = String(email || '').trim().toLowerCase();
          if (!e || EXCLUS.includes(e)) return;
          (parEmail[e] = parEmail[e] || []).push((prenom || '').trim());
        };
        push(ins.prenom, ins.email);
        push(ins.co1_prenom, ins.co1_email);
        // Pas de co2_email / co3_email en DB : les coéquipiers 2 et 3 ne reçoivent pas directement.
      });
      let emails = Object.keys(parEmail).sort();
      const prenomDe = e => {
        const prenoms = [...new Set(parEmail[e].filter(Boolean))];
        return prenoms.length === 1 ? prenoms[0] : null;
      };

      // Cas « rattrapage » : cible un seul email (nouveau·elle inscrit·e tardif·ve).
      if (b.only_email) {
        const cible = String(b.only_email).trim().toLowerCase();
        if (!parEmail[cible]) return res.status(404).json({ error: 'only_email absent de la liste HC #3' });
        emails = [cible];
      }

      if (b.test_to) {
        const n = await resendBatch(resendKey,
          [{ from: FROM, to: String(b.test_to).trim(), reply_to: REPLY_TO, ...mailVaguesClosed('Stéphanie (APERÇU)') }],
          `hc3-vagues-closed-test-${Date.now()}`);
        return res.status(200).json({ test: true, envoyes: n, nb_destinataires_reels: emails.length });
      }
      if (b.envoyer !== true) {
        return res.status(200).json({
          dry_run: true,
          nombre: emails.length,
          apercu_10_premiers: emails.slice(0, 10).map(e => ({ email: e, salut_avec: prenomDe(e) || '«Salut à toi»' })),
        });
      }
      let envoyes = 0;
      for (let i = 0; i < emails.length; i += 100) {
        envoyes += await resendBatch(resendKey,
          emails.slice(i, i + 100).map(to => ({ from: FROM, to, reply_to: REPLY_TO, ...mailVaguesClosed(prenomDe(to)) })),
          b.only_email ? `hc3-vagues-closed-only-${b.only_email}-v1` : `hc3-vagues-closed-lot${i / 100}-v1`);
      }
      return res.status(200).json({ envoye: true, nombre: emails.length, envoyes });
    }

    if (b.mode === 'benevoles_rulebook') {
      // Mail aux bénévoles HC #3 (created_at >= 2026-09-01, même pivot que l'admin).
      // Exclut ceux qui sont uniquement sur la veille (= Parent-Enfant samedi, pas HC #3 dimanche).
      const { data, error } = await db.from('Benevoles')
        .select('id,prenom,email,disponibilites,created_at')
        .gte('created_at', '2026-09-01');
      if (error) return res.status(500).json({ error: error.message });
      const EXCLUS = ['stephanie.caro31@gmail.com'];
      const parEmail = {};
      (data || []).forEach(r => {
        if ((r.disponibilites || '').trim() === 'veille') return; // uniquement samedi PE : ignorer
        const e = String(r.email || '').trim().toLowerCase();
        if (!e || EXCLUS.includes(e)) return;
        (parEmail[e] = parEmail[e] || []).push((r.prenom || '').trim());
      });
      const emails = Object.keys(parEmail).sort();
      const prenomDe = e => {
        const prenoms = [...new Set(parEmail[e].filter(Boolean))];
        return prenoms.length === 1 ? prenoms[0] : null;
      };

      if (b.test_to) {
        const n = await resendBatch(resendKey,
          [{ from: FROM, to: String(b.test_to).trim(), reply_to: REPLY_TO, ...mailBenevolesRulebook('Stéphanie (APERÇU)') }],
          `hc3-benev-rb-test-${Date.now()}`);
        return res.status(200).json({ test: true, envoyes: n, nb_destinataires_reels: emails.length });
      }
      if (b.envoyer !== true) {
        return res.status(200).json({
          dry_run: true,
          nombre: emails.length,
          apercu_10_premiers: emails.slice(0, 10).map(e => ({ email: e, salut_avec: prenomDe(e) || '«Salut à toi»' })),
        });
      }
      let envoyes = 0;
      for (let i = 0; i < emails.length; i += 100) {
        envoyes += await resendBatch(resendKey,
          emails.slice(i, i + 100).map(to => ({ from: FROM, to, reply_to: REPLY_TO, ...mailBenevolesRulebook(prenomDe(to)) })),
          `hc3-benev-rb-lot${i / 100}-v1`);
      }
      return res.status(200).json({ envoye: true, nombre: emails.length, envoyes });
    }

    if (b.mode === 'benevoles_rappel_accueil') {
      // Rappel la veille : passer à l'Accueil en arrivant. Même pivot que benevoles_rulebook.
      const { data, error } = await db.from('Benevoles')
        .select('id,prenom,email,disponibilites,created_at')
        .gte('created_at', '2026-09-01');
      if (error) return res.status(500).json({ error: error.message });
      const EXCLUS = ['stephanie.caro31@gmail.com'];
      const parEmail = {};
      (data || []).forEach(r => {
        if ((r.disponibilites || '').trim() === 'veille') return; // samedi PE uniquement : ignorer
        const e = String(r.email || '').trim().toLowerCase();
        if (!e || EXCLUS.includes(e)) return;
        (parEmail[e] = parEmail[e] || []).push((r.prenom || '').trim());
      });
      const emails = Object.keys(parEmail).sort();
      const prenomDe = e => {
        const prenoms = [...new Set(parEmail[e].filter(Boolean))];
        return prenoms.length === 1 ? prenoms[0] : null;
      };
      if (b.test_to) {
        const n = await resendBatch(resendKey,
          [{ from: FROM, to: String(b.test_to).trim(), reply_to: REPLY_TO, ...mailBenevolesRappelAccueil('Stéphanie (APERÇU)') }],
          `hc3-benev-ra-test-${Date.now()}`);
        return res.status(200).json({ test: true, envoyes: n, nb_destinataires_reels: emails.length });
      }
      if (b.envoyer !== true) {
        return res.status(200).json({
          dry_run: true,
          nombre: emails.length,
          apercu_10_premiers: emails.slice(0, 10).map(e => ({ email: e, salut_avec: prenomDe(e) || '«Bonjour»' })),
        });
      }
      const cleSuffixe = b.cle_suffixe ? `-${String(b.cle_suffixe).replace(/[^a-z0-9_-]/gi,'')}` : '-v1';
      let envoyes = 0;
      for (let i = 0; i < emails.length; i += 100) {
        envoyes += await resendBatch(resendKey,
          emails.slice(i, i + 100).map(to => ({ from: FROM, to, reply_to: REPLY_TO, ...mailBenevolesRappelAccueil(prenomDe(to)) })),
          `hc3-benev-ra-lot${i / 100}${cleSuffixe}`);
      }
      return res.status(200).json({ envoye: true, nombre: emails.length, envoyes });
    }

    if (b.mode === 'retrait_pack') {
      // Mail à TOUS les athlètes payés HC #3 (dimanche 15/11) + PE #2 (samedi 14/11).
      // Dédoublonne par email (capitaine + co1).
      const { data, error } = await db.from('Inscriptions')
        .select('id,prenom,nom,email,co1_prenom,co1_nom,co1_email,categorie,heure_depart,statut_paiement')
        .gte('heure_depart', '2026-11-14').lt('heure_depart', '2026-11-16')
        .eq('statut_paiement', 'paye');
      if (error) return res.status(500).json({ error: error.message });
      const EXCLUS = ['stephanie.caro31@gmail.com'];
      const parEmail = {};
      (data || []).forEach(ins => {
        const push = (prenom, email) => {
          const e = String(email || '').trim().toLowerCase();
          if (!e || EXCLUS.includes(e)) return;
          (parEmail[e] = parEmail[e] || []).push((prenom || '').trim());
        };
        push(ins.prenom, ins.email);
        push(ins.co1_prenom, ins.co1_email);
      });
      const emails = Object.keys(parEmail).sort();
      const prenomDe = e => {
        const prenoms = [...new Set(parEmail[e].filter(Boolean))];
        return prenoms.length === 1 ? prenoms[0] : null;
      };

      if (b.test_to) {
        const n = await resendBatch(resendKey,
          [{ from: FROM, to: String(b.test_to).trim(), reply_to: REPLY_TO, ...mailRetraitPack('Stéphanie (APERÇU)') }],
          `hc3-retrait-pack-test-${Date.now()}`);
        return res.status(200).json({ test: true, envoyes: n, nb_destinataires_reels: emails.length });
      }
      if (b.envoyer !== true) {
        return res.status(200).json({
          dry_run: true,
          nombre: emails.length,
          apercu_10_premiers: emails.slice(0, 10).map(e => ({ email: e, salut_avec: prenomDe(e) || '«Salut à toi»' })),
        });
      }
      let envoyes = 0;
      for (let i = 0; i < emails.length; i += 100) {
        envoyes += await resendBatch(resendKey,
          emails.slice(i, i + 100).map(to => ({ from: FROM, to, reply_to: REPLY_TO, ...mailRetraitPack(prenomDe(to)) })),
          `hc3-retrait-pack-lot${i / 100}-v1`);
      }
      return res.status(200).json({ envoye: true, nombre: emails.length, envoyes });
    }

    if (b.mode === 'benevoles_placement') {
      // Mail personnalisé à chaque bénévole journée avec son poste (matin, aprem, pause).
      const { data, error } = await db.from('Benevoles')
        .select('id,prenom,nom,email,disponibilites,station_matin,station_aprem,pause_creneau,remplace_11h30')
        .gte('created_at', '2026-09-01');
      if (error) return res.status(500).json({ error: error.message });
      const EXCLUS_EMAILS = ['stephanie.caro31@gmail.com'];
      const EXCLUS_PRENOMS = ['Alex mandre','David','Karine','Loïc','Maryan','Romu','Steph','Stérenn'];
      const fiches = (data || []).filter(r => {
        if (!(r.disponibilites || '').includes('journee')) return false;
        const email = String(r.email || '').trim().toLowerCase();
        if (!email || EXCLUS_EMAILS.includes(email)) return false;
        if (EXCLUS_PRENOMS.includes((r.prenom || '').trim())) return false;
        const hasStation = (r.station_matin && r.station_matin !== 'Photo') || (r.station_aprem && r.station_aprem !== 'Photo');
        if (!hasStation) return false;
        return true;
      });

      if (b.test_to) {
        const mock = { prenom: 'Stéphanie (APERÇU)', station_matin: 'Wall Ball', station_aprem: 'Wall Ball', pause_creneau: '11h-12h', remplace_11h30: null };
        const n = await resendBatch(resendKey,
          [{ from: FROM, to: String(b.test_to).trim(), reply_to: REPLY_TO, ...mailBenevolesPlacement(mock) }],
          `hc3-benev-plc-test-${Date.now()}`);
        return res.status(200).json({ test: true, envoyes: n, nb_destinataires_reels: fiches.length });
      }
      if (b.envoyer !== true) {
        return res.status(200).json({
          dry_run: true,
          nombre: fiches.length,
          apercu: fiches.map(f => ({
            prenom: f.prenom, nom: f.nom, email: f.email,
            matin: f.station_matin, aprem: f.station_aprem, pause: f.pause_creneau,
            note: f.remplace_11h30 || null,
          })),
        });
      }
      let envoyes = 0;
      for (let i = 0; i < fiches.length; i += 100) {
        envoyes += await resendBatch(resendKey,
          fiches.slice(i, i + 100).map(f => ({ from: FROM, to: f.email, reply_to: REPLY_TO, ...mailBenevolesPlacement(f) })),
          `hc3-benev-plc-lot${i / 100}-v1`);
      }
      return res.status(200).json({ envoye: true, nombre: fiches.length, envoyes });
    }

    if (b.mode === 'benevole_special') {
      // Mail à UN bénévole avec rôle atypique. Templates hardcodés.
      if (!b.id || !b.role) return res.status(400).json({ error: 'id et role requis' });
      const { data, error } = await db.from('Benevoles').select('id,prenom,nom,email').eq('id', b.id).single();
      if (error || !data) return res.status(404).json({ error: 'Bénévole introuvable' });
      const templates = {
        'loic_sledpull_skierg': mailBenevoleLoicRenfortSP,
        'dany_burpees': mailBenevoleDanyRenfortBurpees,
        'david_renfort_orga': mailBenevoleDavidRenfortOrga,
        'karine_coordination': mailBenevoleKarineCoordination,
        'sterenn_accueil': mailBenevoleSterennAccueil,
        'loris_wallball': mailBenevoleLorisWallBall,
        'michel_renfort_matin': mailBenevoleMichelRenfortMatin,
        'camille_lunges_aprem': mailBenevoleCamilleLungesAprem,
        'sabine_wallball': mailBenevoleSabineWallBall,
      };
      const mailFn = templates[b.role];
      if (!mailFn) return res.status(400).json({ error: 'role invalide : ' + Object.keys(templates).join(', ') });

      if (b.test_to) {
        const n = await resendBatch(resendKey,
          [{ from: FROM, to: String(b.test_to).trim(), reply_to: REPLY_TO, ...mailFn() }],
          `hc3-special-${b.role}-test-${Date.now()}`);
        return res.status(200).json({ test: true, envoyes: n, fiche: data });
      }
      if (b.envoyer !== true) return res.status(200).json({ dry_run: true, fiche: data, role: b.role });
      if (!data.email) return res.status(400).json({ error: 'Bénévole sans email' });
      const cleSuffixe = b.cle_suffixe ? `-${String(b.cle_suffixe).replace(/[^a-z0-9_-]/gi,'')}` : '-v1';
      const n = await resendBatch(resendKey,
        [{ from: FROM, to: data.email, reply_to: REPLY_TO, ...mailFn() }],
        `hc3-special-${b.role}${cleSuffixe}`);
      return res.status(200).json({ envoye: true, envoyes: n, to: data.email });
    }

    if (b.mode === 'benevoles_demi') {
      // Mail à tous les demi-journée (matin OU aprem) avec leur poste.
      // shift: 'matin' ou 'aprem'
      const shift = b.shift;
      if (shift !== 'matin' && shift !== 'aprem') return res.status(400).json({ error: 'shift requis : matin ou aprem' });
      const { data, error } = await db.from('Benevoles')
        .select('id,prenom,nom,email,disponibilites,station_matin,station_aprem')
        .eq('disponibilites', shift)
        .gte('created_at', '2026-09-01');
      if (error) return res.status(500).json({ error: error.message });
      const EXCLUS_EMAILS = ['stephanie.caro31@gmail.com'];
      // Exclusions par prénom (ceux qui ont déjà reçu un mail spécial ou n'en reçoivent pas)
      const EXCLUS_PRENOMS = shift === 'matin'
        ? ['dany']  // Dany a reçu le mail spécial
        : ['Loris','Christian'];  // Loris spécial, Christian sans email
      const stationKey = 'station_' + shift;
      const fiches = (data || []).filter(r => {
        const email = String(r.email || '').trim().toLowerCase();
        if (!email || EXCLUS_EMAILS.includes(email)) return false;
        if (EXCLUS_PRENOMS.some(p => p.toLowerCase() === (r.prenom || '').trim().toLowerCase())) return false;
        const st = r[stationKey];
        if (!st || st === 'Photo') return false;
        return true;
      });
      const mailFn = shift === 'matin' ? mailBenevoleDemiMatin : mailBenevoleDemiAprem;

      if (b.test_to) {
        const n = await resendBatch(resendKey,
          [{ from: FROM, to: String(b.test_to).trim(), reply_to: REPLY_TO, ...mailFn('Stéphanie (APERÇU)', 'Wall Ball') }],
          `hc3-benev-demi-${shift}-test-${Date.now()}`);
        return res.status(200).json({ test: true, envoyes: n, nb_destinataires_reels: fiches.length });
      }
      if (b.envoyer !== true) {
        return res.status(200).json({
          dry_run: true,
          shift,
          nombre: fiches.length,
          apercu: fiches.map(f => ({ prenom: f.prenom, nom: f.nom, email: f.email, station: f[stationKey] })),
        });
      }
      let envoyes = 0;
      for (let i = 0; i < fiches.length; i += 100) {
        envoyes += await resendBatch(resendKey,
          fiches.slice(i, i + 100).map(f => ({ from: FROM, to: f.email, reply_to: REPLY_TO, ...mailFn((f.prenom || '').trim(), f[stationKey]) })),
          `hc3-benev-demi-${shift}-lot${i / 100}-v1`);
      }
      return res.status(200).json({ envoye: true, shift, nombre: fiches.length, envoyes });
    }

    if (b.mode === 'benevoles_pe2') {
      // Mail à tous les bénévoles PE #2 samedi (dispo contient 'veille').
      const { data, error } = await db.from('Benevoles')
        .select('id,prenom,nom,email,disponibilites')
        .like('disponibilites', '%veille%')
        .gte('created_at', '2026-09-01');
      if (error) return res.status(500).json({ error: error.message });
      const EXCLUS_EMAILS = ['stephanie.caro31@gmail.com'];
      const fiches = (data || []).filter(r => {
        const email = String(r.email || '').trim().toLowerCase();
        if (!email || EXCLUS_EMAILS.includes(email)) return false;
        return true;
      });

      if (b.test_to) {
        const n = await resendBatch(resendKey,
          [{ from: FROM, to: String(b.test_to).trim(), reply_to: REPLY_TO, ...mailBenevolesPE2('Stéphanie (APERÇU)') }],
          `hc3-benev-pe2-test-${Date.now()}`);
        return res.status(200).json({ test: true, envoyes: n, nb_destinataires_reels: fiches.length });
      }
      if (b.envoyer !== true) {
        return res.status(200).json({
          dry_run: true,
          nombre: fiches.length,
          apercu: fiches.map(f => ({ prenom: f.prenom, nom: f.nom, email: f.email, dispo: f.disponibilites })),
        });
      }
      let envoyes = 0;
      for (let i = 0; i < fiches.length; i += 100) {
        envoyes += await resendBatch(resendKey,
          fiches.slice(i, i + 100).map(f => ({ from: FROM, to: f.email, reply_to: REPLY_TO, ...mailBenevolesPE2((f.prenom || '').trim()) })),
          `hc3-benev-pe2-lot${i / 100}-v1`);
      }
      return res.status(200).json({ envoye: true, nombre: fiches.length, envoyes });
    }

    return res.status(400).json({ error: 'mode manquant : vague_change, categorie_change, vagues_closed, benevoles_rulebook, retrait_pack, benevoles_placement, benevole_special, benevoles_demi ou benevoles_pe2' });
  } catch (e) {
    console.error('hc3-notif', e);
    return res.status(500).json({ error: e.message });
  }
}
