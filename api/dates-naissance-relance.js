// Relance pour corriger 4 dates de naissance HC #3 incorrectes.
//   POST { password }                    → dry_run, liste des destinataires
//   POST { password, test_to: 'x@y.fr' } → envoie un exemple à cette adresse
//   POST { password, envoyer: true }     → envoie les 4 mails pour de vrai

const FROM = 'Hyrox Challenge La Buse <noreply@htclabuse.fr>';
const REPLY_TO = 'htclabuse@gmail.com';

// Les 4 cas : si "capitaine", c'est la date du capitaine qui est fausse.
// Si "coeq", c'est la date du coéquipier/coéquipière qui est fausse.
const CAS = [
  { id: 451, nom_prenom: 'Marine GEDOR',       email: 'marine.gmart@gmail.com',       equipe: 'Casbah, Camargue et Courbatures', champ: 'capitaine', personne_concernee: 'ta' },
  { id: 479, nom_prenom: 'Clément Pitou',      email: 'clement.pitou97@gmail.com',    equipe: 'Call 911',                        champ: 'coeq', personne_concernee: 'Leo Garaios' },
  { id: 551, nom_prenom: 'Fabienne Fontaine',  email: 'fabiennefontaine177@gmail.com', equipe: 'Les foldingues',                 champ: 'coeq', personne_concernee: 'Morgane Fontaine' },
  { id: 612, nom_prenom: 'Jill Edmar',         email: 'jilledmar@orange.fr',          equipe: 'Big BaleZ',                       champ: 'coeq', personne_concernee: 'Sophie Balusson' },
];

function buildMail(c) {
  const prenom = c.nom_prenom.split(' ')[0];
  const equipeLigne = c.equipe ? `<p>Ton équipe : <strong>${c.equipe}</strong>.</p>` : '';
  let intro;
  if (c.champ === 'capitaine') {
    intro = `Nous avons remarqué que <strong>ta date de naissance</strong> dans l'inscription semble incorrecte (une saisie bizarre). Peux-tu nous confirmer ta <strong>vraie date de naissance</strong> (format JJ/MM/AAAA) par retour de mail ?`;
  } else {
    intro = `Nous avons remarqué que la date de naissance de <strong>${c.personne_concernee}</strong> (ton/ta coéquipier·e) semble incorrecte (une date de 2026 a été saisie). Peux-tu nous transmettre sa <strong>vraie date de naissance</strong> (format JJ/MM/AAAA) par retour de mail ?`;
  }
  return {
    subject: '🏃 Hyrox Challenge La Buse #3 — correction date de naissance',
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;font-size:15px;">
<p>Salut <strong>${prenom}</strong>,</p>
<p>${intro}</p>
<p>Pourquoi on te demande ça : on utilise la date de naissance pour calculer la <strong>tranche d'âge</strong> dans le classement et les podiums. Sans une bonne date, ton équipe serait invisible dans la vue des catégories d'âge.</p>
${equipeLigne}
<p>Merci d'avance ! On corrige tout de suite dès ta réponse.</p>
<p>Stéphanie &amp; l'équipe La Buse 💛🖤</p>
<hr style="border:none;border-top:1px solid #eee;margin:18px 0;">
<p style="font-size:12px;color:#888;">Rendez-vous dimanche 15 novembre 2026.</p>
</div>`
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  const b = req.body || {};
  if (!process.env.JUGES_PASSWORD || b.password !== process.env.JUGES_PASSWORD) return res.status(401).json({ error: 'Mot de passe incorrect' });
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: 'Pas de resend key' });

  if (b.test_to) {
    const to = String(b.test_to).trim();
    const mail = buildMail(CAS[0]); // envoie l'exemple avec le 1er cas (Marine)
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, reply_to: REPLY_TO, subject: '[APERÇU] ' + mail.subject, html: mail.html })
    });
    const data = await r.json().catch(() => ({}));
    return res.status(r.ok ? 200 : 500).json({ test: r.ok, to, exemple_de: CAS[0].nom_prenom, resend: data });
  }

  if (b.envoyer !== true) {
    return res.status(200).json({
      dry_run: true,
      nombre: CAS.length,
      destinataires: CAS.map(c => ({ id: c.id, nom: c.nom_prenom, email: c.email, concerne: c.champ === 'capitaine' ? 'elle-même' : c.personne_concernee })),
    });
  }

  const results = [];
  for (const c of CAS) {
    const mail = buildMail(c);
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json', 'Idempotency-Key': `dn-relance-${c.id}-v1` },
        body: JSON.stringify({ from: FROM, to: c.email, reply_to: REPLY_TO, subject: mail.subject, html: mail.html })
      });
      const data = await r.json().catch(() => ({}));
      results.push({ id: c.id, nom: c.nom_prenom, email: c.email, ok: r.ok, resend: data });
    } catch (e) {
      results.push({ id: c.id, nom: c.nom_prenom, email: c.email, ok: false, error: e.message });
    }
  }
  const envoyes = results.filter(r => r.ok).length;
  return res.status(200).json({ envoye: true, nombre: CAS.length, envoyes, results });
}
