export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { password } = req.body || {};

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Mot de passe requis' });
    }

    const expectedPassword = process.env.JUGES_PASSWORD;

    if (!expectedPassword) {
      console.error('JUGES_PASSWORD non configuré dans les variables d\'environnement');
      return res.status(500).json({ error: 'Configuration serveur incomplète' });
    }

    if (password !== expectedPassword) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Erreur juge-login:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
