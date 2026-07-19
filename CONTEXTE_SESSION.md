# CONTEXTE SESSION — dernière mise à jour : dimanche 19 juillet 2026

## 🚀 ÉTAT ACTUEL

**Les inscriptions HC #3 sont OUVERTES** depuis le dimanche 19 juillet 2026 (commit `f6704ce`).
Événement : **dimanche 15 novembre 2026**, Crossfit La Buse — Saint-Paul, La Réunion.

Un mail de pré-annonce a été envoyé aux **260 anciens participants** (HC #1 + HC #2 + Parent-Enfant + Kids), avec le code promo `RETOUR10` (-10 %).

### Tout est déployé et validé ✅

| Élément | État |
|---|---|
| Site public (`index.html`) | ✅ en ligne, boutons « Inscriptions ici » actifs |
| Page d'inscription HC #3 | ✅ en ligne |
| 8 Payment Links Stripe | ✅ LIVE |
| Webhook Stripe → base | ✅ testé bout-en-bout |
| Mail de confirmation | ✅ testé, template unifié |
| Admin par événement | ✅ terminé |
| Base de données | ✅ propre, 0 inscription HC #3 au moment du lancement |

---

## 📋 Session du 18-19 juillet — ce qui a été fait

### 1. Site public (`index.html`)
- Onglet **Accueil** : bandeau photo noir retiré · prix HC #3 (55/110 €) · Relais retiré · bandeau jaune « Prix tout compris — frais de plateforme absorbés » · section « Ce qui est inclus » · photos déco en bas
- Onglet **Épreuves** : encadré jaune HC · encadré multicolore Parent-Enfant (sans Sled Pull) · descriptions RX 1000 m / Scaled 500 m
- Onglet **À venir** : carte HC #3 avec 4 onglets grisés (Leaderboard, Résultats, Photos, Vagues)
- Onglet **Passés** : HC #1 aligné sur le format HC #2 · HC #1 corrigé à 164 athlètes
- Nav : onglets mieux séparés visuellement · nouvel onglet ELITE 12

**Section « Ce qui est inclus » — 5 blocs** (ajout du T-shirt le 19 juillet) :
1. 👕 **T-shirt offert à chaque athlète** (liseré bleu `#3498DB`)
2. 🏅 Patch finisher pour tous
3. 🏆 Plus de 40 podiums à décrocher
4. ⭐ Qualif ELITE 12 — Grande Finale 2027
5. ⚡ Course 100 % digitalisée

**Ouverture des inscriptions (19 juillet)** :
- **3 boutons « 🔥 Inscriptions ici »** → hero, encadré « Prochain événement » (Accueil), carte HC #3 (À venir)
- Bandeau vert du hero : « 🔥 Hyrox Challenge La Buse #3 — Dimanche 15 novembre »
- ⚠️ **Toutes les mentions « dimanche 19 juillet à midi » ont été retirées** de `index.html`. Ne pas les réintroduire : elles seraient fausses.

### 2. Nouvelles pages
- **`elite12.html`** : classement top 12 combiné HC #1 + HC #2 avec dédup (alias ONORA/ONORATO) · exclut Relais
- **`podiums.html`** : horaires podiums par catégorie (last vague + 2h) · tri chrono
- **`vagues.html`** : planning imprimable des vagues + dossards
- **`benevoles-distrib.html`** : distribution bénévoles (T-shirt/Boisson/Bon conso/Repas/Chèque Intersport) · 2 onglets À faire/Fini · repas et chèque uniquement pour dispo « journee »

### 3. Inscription (`inscription.html`) — HC #3
- Prix : Solo 55 €, Duo 110 € (Relais et Parent-Enfant retirés)
- Code promo **`RETOUR10`** (-10 % sur l'inscription, **pas** sur le pack photo)
- **Pack photo** (+20 € par équipe, forfait) : case à cocher étape 5
- Bandeau HC #3 en haut · overlay « COMPLET » retiré
- Étape Profil : bloc **🚨 Contact urgence** (nom / prénom / téléphone) obligatoire · **double saisie email** (copier-coller désactivé)
- Étape catégorie : **RX · 1 000 m** / **Scaled · 500 m** sur chaque bouton
- Étape T-shirt : **XS retiré** (femme S/M/L/XL · homme S/M/L/XL/XXL)
- Étape 5 récap : politique de remboursement · attestation santé obligatoire · bouton « Payer » bloqué tant que la case n'est pas cochée
- Étape 6 : message « mail de confirmation envoyé » + rappel spams

### 4. ⭐ Template de mail unifié (19 juillet) — IMPORTANT

**Problème trouvé** : `api/admin-send-confirmation-email.js` avait sa **propre copie** du template, restée sur une ancienne version (sans la section « Ce qui est inclus »). La preview envoyait donc un mail **différent** de celui reçu par les vrais inscrits.

**Correction** : le template vit désormais dans **`lib/email-template.js`**, importé par les deux routes.

```
lib/email-template.js   ← SOURCE UNIQUE. Toute modif du mail se fait ICI.
  ├── api/webhook.js                       (envoi réel après paiement Stripe)
  └── api/admin-send-confirmation-email.js (preview / renvoi manuel)
```

Fonctions exportées : `getAgeCat`, `getMoyenneAge`, `isParentEnfantInscription`, `buildParentEnfantEmailHtml`, `buildEmailHtml`.

Signature : `buildEmailHtml(inscription, nomStripe, montantPaye)`.
Depuis l'admin on appelle `buildEmailHtml(inscription, null, inscription.prix)` (pas de nom Stripe, montant lu en base).

⚠️ **Ne jamais recréer une copie du template dans une route.** C'est exactement le bug qui a été corrigé.

### 5. Contenu du mail de confirmation HC #3
- **Share card** noir + jaune fluo (screenshot-friendly) : titre HC #3 + date + tous les athlètes + équipe + catégorie + temps estimé
- **Infos perso** : T-shirt, cat âge, contact urgence, pack photo, montant, coéquipiers
- **Politique de remboursement** (revente possible jusqu'au 5 nov)
- **Ce qui est inclus** — les 5 blocs identiques au site
- CTA site + footer

### 6. Admin (`admin.html`) — REFACTOR OPTION A TERMINÉ ✅

**Sélecteur d'événement en haut + filtrage global.**

- `currentEvent` (défaut `'hc3'`) + `EVENT_FILTERS` + `EVENT_LABELS` + `eventData()` + `nbAthletes(insc)` + `switchEvent(key, btn)`
- Barre `event-tabs` : 🏃 HC #2 · 👨‍👧 Parent-Enfant · 🔥 HC #3 (actif par défaut)
- **Onglets filtrés par événement** via `EVENT_TABS` + `applyEventTabs()` :
  - **HC #2 / HC #3** → Ordre d'inscription, Par catégorie, Ordre de passage, T-shirts, Trophées & Patchs, Pack photo, Bénévoles
  - **Parent-Enfant** → Parent-Enfant, Pré-inscriptions Kids
  - Si l'onglet ouvert n'existe pas pour l'événement choisi, bascule automatique sur le premier disponible
- **Bande stats** : Inscriptions · Athlètes total · Solo · Duo · 📸 Pack photo
  - Sur Parent-Enfant : libellé « Binômes inscrits », Solo/Duo/Pack masqués, carte « 🧒 Pré-inscriptions Kids » affichée
  - **Athlètes total** compte les coéquipiers (un duo = 2)
  - HC #2 **exclut** les Parent-Enfant du total
- **Onglet 📸 Pack photo** (`renderPackPhoto()`) : packs vendus, dont payés, athlètes concernés, CA, + liste détaillée
- Colonne **📸 Pack photo** dans « Ordre d'inscription » (✓ vert / — gris)
- **Export CSV** : limité à l'événement sélectionné, colonne Pack photo incluse, fichier `inscrits_<event>.csv`
- `renderPassage` : filtre hardcodé `2026-07-12` retiré, utilise `eventData()`

Vérifié : le refresh auto 30 s **ne casse pas** l'événement sélectionné (`loadData()` ne touche jamais à `currentEvent`).

### 7. Test bout-en-bout du paiement (19 juillet) ✅

Vraie inscription payée par CB, **inscription id 316** (Maryan Rivière, Solo Homme RX, Solo + pack photo + `RETOUR10` = 69,50 €).

Validé :
- `statut_paiement = paye` → **preuve que le webhook Stripe a bien tourné** (le formulaire n'écrit jamais `paye`, seul le webhook le fait)
- `pack_photo = true`, `sante_declaree = true`, contact urgence rempli, T-shirt M Homme
- Inscription visible dans l'admin sur l'onglet HC #3
- Accents corrects de bout en bout (« Rivière » stocké et relu intact)

Ensuite : remboursée dans Stripe et **lignes 315 + 316 supprimées** de la base. Les compteurs HC #3 démarrent à 0.

### 8. Mails envoyés
- **260 mails de pré-annonce HC #3** (152 → HC #2/PE/Kids + 51 → HC #1 nouveaux + previews)
- Previews du mail de confirmation → `stephanie.caro31@gmail.com`
- `mail-HC3-corps.html` déposé dans `~/Downloads/` pour partage WhatsApp

### 9. QR codes
- `qrcodes-orga.html` : 4 QR (Accueil · Juges · Distribution bénévoles · Résultats)
- `qrcodes-public.html` : 5 QR (Vagues · Podiums · Live · Résultats · Séance d'essai) — compact 1 page A4

### 10. Fixes bugs event 2 (rétro)
- API `event2-resultats` : pagination (limite 1000 pointages) · `heure_debut_reelle` au lieu de `heure_depart` · privilégie `temps_final_s` (respecte les corrections manuelles)
- Leaderboard + Résultats : « Temps brut » retiré · mode « Général » quand filtre âge = Toutes
- Ligne mot de passe retirée de `resultats.html`

---

## 🔧 Fichiers clés

### Créés
- `lib/email-template.js` — **template mail, source unique**
- `elite12.html` · `podiums.html` · `vagues.html` · `benevoles-distrib.html`
- `api/admin-reset-course.js` — DELETE all Pointages + reset heures/temps
- `api/admin-penalite.js` — pénalités a posteriori
- `api/admin-update-pointage.js` — corriger le timestamp d'un pointage

### Modifiés (majeurs)
- `index.html` — refonte + boutons d'inscription
- `inscription.html` — HC #3 complet
- `admin.html` — refactor Option A terminé
- `api/webhook.js` — importe le template partagé (handler inchangé)
- `api/admin-send-confirmation-email.js` — importe le template partagé
- `api/event2-resultats.js` · `juge.html` · `accueil.html` · `live.html` · `leaderboard.html` · `resultats.html` · `qrcodes-*.html`

---

## 🗄 Supabase

### Colonnes ajoutées (via SQL Editor, `ADD COLUMN IF NOT EXISTS`)

**Table `Inscriptions`** :
`absent BOOLEAN DEFAULT false` · `abandon BOOLEAN DEFAULT false` · `pack_photo BOOLEAN DEFAULT false` · `contact_urgence_nom TEXT` · `contact_urgence_prenom TEXT` · `contact_urgence_tel TEXT` · `sante_declaree BOOLEAN NOT NULL DEFAULT false`
(déjà présentes) `temps_final_s INTEGER` · `pack_remis_at TIMESTAMPTZ` · `heure_debut_reelle TIMESTAMPTZ`

**Table `Benevoles`** :
`tshirt_distribue_at` · `repas_distribue_at` · `boisson_distribuee_at` · `bon_conso_distribue_at` · `cheque_intersport_at` (tous `TIMESTAMPTZ`)

### RLS — ⚠️ NON TOUCHÉ, à traiter
- `Inscriptions` et `Benevoles` : **RLS DÉSACTIVÉE** (nécessaire pour que `accueil.html` et `benevoles-distrib.html` écrivent client-side avec l'anon key)
- `Pointages` : RLS activée (seul le service key y accède)
- **Alerte Supabase reçue** (« Table publicly accessible ») — voir priorité 1 ci-dessous

### Pas de fichier de migrations
Toutes les modifications de schéma ont été faites à la main via l'interface Supabase.

---

## 🔑 Config

### Variables d'env Vercel (noms seulement)
`SUPABASE_SERVICE_KEY` · `STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET` · `RESEND_API_KEY` · `JUGES_PASSWORD`

### Mots de passe — ⚠️ ATTENTION, ils diffèrent
| Usage | Mot de passe |
|---|---|
| Page `admin.html` | `stephaniefitness974` |
| Pages juges / accueil / bénévoles-distrib | `labuse` |
| **API `admin-send-confirmation-email`** | **`labuse`** (= `JUGES_PASSWORD`, **pas** le mot de passe admin) |

### Stripe Payment Links HC #3 (LIVE)
| Produit | Prix | Fin de l'URL |
|---|---|---|
| HC3 - Solo | 55 € | `eVqcN4b5X3BF9zz7G48Vi09` |
| HC3 - Solo (RETOUR10) | 49,50 € | `eVq4gyde50ptbHH2lK8Vi0a` |
| HC3 - Solo + Pack Photo | 75 € | `dRmcN40rjfkn277aSg8Vi0b` |
| HC3 - Solo + Pack Photo (RETOUR10) | 69,50 € | `fZucN42zr2xB5jjaSg8Vi0c` |
| HC3 - Duo | 110 € | `7sY3cuei96NReTT4tS8Vi0d` |
| HC3 - Duo (RETOUR10) | 99 € | `3cI28q0rj4FJdPPbWk8Vi0e` |
| HC3 - Duo + Pack Photo | 130 € | `14A6oGca1fkn8vvgcA8Vi0h` |
| HC3 - Duo + Pack Photo (RETOUR10) | 119 € | `dRm7sK3Dv7RVcLLd0o8Vi0g` |

(Le lien à 150 € « Duo + Pack » créé par erreur a été **désactivé**.)

---

## ⚠️ CE QUI RESTE À FAIRE

### 🔴 PRIORITÉ 1 — Sécurité RLS Supabase
Une alerte Supabase signale les tables publiquement accessibles. Maintenant que les inscriptions sont ouvertes, les données personnelles des athlètes sont en base.
- Activer RLS sur `Inscriptions` et `Benevoles`
- Créer `/api/admin-update-inscription` et `/api/admin-update-benevole` (protégés par mot de passe)
- Refactorer `accueil.html` et `benevoles-distrib.html` pour passer par ces endpoints au lieu d'écrire client-side
- Estimation : ~2 h de dev + test

### 🟠 PRIORITÉ 2 — Archiver HC #2
À faire avant que HC #3 ne remplisse la base.
- Exporter inscriptions HC #2 + pointages + bénévoles → `data/event-2.json` (comme `event-1.json`)
- Adapter `resultats.html` et `leaderboard.html` pour lire event-2 depuis le JSON statique
- Purger `Inscriptions` (HC #2 uniquement), `Pointages`, `Benevoles`
- Estimation : ~1 h

### 🟡 PRIORITÉ 3 — Améliorations
- **Refactor admin Option B** : 3 onglets top-level = 3 events, sous-onglets propres. Plus propre visuellement mais lourd (~3 h). L'Option A actuelle fait déjà le travail.
- Recréer des athlètes tests si besoin (voir commits précédents pour les dossards 995-998)

---

## 🐛 Points d'attention

- **`renderPassage`** : si les vagues et heures ne sont pas assignées pour HC #3, l'onglet sera vide — c'est normal.
- **Kids pré-inscriptions** : `allKids` est séparé de `allData` dans `loadData`. L'onglet Kids n'est pas filtré par événement, il est rattaché à Parent-Enfant.
- **Pack photo dans le mail** : ligne affichée seulement si `pack_photo === true`. Le +20 € est déjà intégré via le Payment Link choisi.
- **Code promo `RETOUR10`** : géré côté JS client uniquement (bascule vers un autre Payment Link), sans vérification serveur. Quelqu'un qui bidouille le HTML peut forcer le lien réduit. Jugé acceptable pour l'usage.
- **Filtre HC #3 dans l'admin** : repose sur `heure_depart` (null ou entre le 14 et le 16 novembre). Tant que les vagues ne sont pas assignées, `heure_depart` est null et tout remonte bien. À revoir si la logique de vagues change.
- **Pas de `node` installé sur le Mac** — impossible de faire un `node --check` en local. Pour tester un module JS : `python3 -m http.server` puis charger la page dans le navigateur (les modules ES sont toujours décodés en UTF-8, contrairement au HTML qui a besoin d'un `<meta charset="utf-8">`).

---

## 🛠 Commandes utiles

```bash
cd /Users/stephaniecaro/hyrox-work/hyrox-challenge-labuse
git status
git log --oneline -10
git push                      # Vercel auto-deploy sur main

# Voir les inscriptions HC #3 en base
curl -s "https://mzyfnmjzlosranptwucr.supabase.co/rest/v1/Inscriptions?select=id,prenom,nom,categorie,prix,statut_paiement,pack_photo&order=id.desc&limit=20" \
  -H "apikey: sb_publishable_SjaqadxtlQdtASZ6TqE61g_2MyPRKEC" \
  -H "Authorization: Bearer sb_publishable_SjaqadxtlQdtASZ6TqE61g_2MyPRKEC" | python3 -m json.tool

# Renvoyer le mail de confirmation d'une inscription (mdp = labuse !)
curl -s -X POST https://hyrox-challenge-labuse.vercel.app/api/admin-send-confirmation-email \
  -H "Content-Type: application/json" \
  -d '{"password":"labuse","mode":"standard","inscription_id":316}'

# Mail de test libre
curl -s -X POST https://hyrox-challenge-labuse.vercel.app/api/admin-send-confirmation-email \
  -H "Content-Type: application/json" \
  -d '{"password":"labuse","mode":"custom","to":"stephanie.caro31@gmail.com","subject":"Test","html":"<b>hello</b>"}'

# Reset données course (mdp = labuse)
curl -s -X POST https://hyrox-challenge-labuse.vercel.app/api/admin-reset-course \
  -H "Content-Type: application/json" -d '{"password":"labuse"}'
```

---

## 📞 Contacts / URLs

- **Site prod** : https://hyrox-challenge-labuse.vercel.app
- **Repo GitHub** : `htclabuse-lab/hyrox-challenge-labuse`
- **Supabase** : https://mzyfnmjzlosranptwucr.supabase.co
- **Stripe** : https://dashboard.stripe.com (compte SARL fitness training, workspace AsrxBoard)
- **Resend expéditeur** : `noreply@htclabuse.fr` (reply_to = `htclabuse@gmail.com`)

---

## 📜 Commits de la session

| Commit | Contenu |
|---|---|
| `c4c2caa` | checkpoint refactor admin en cours |
| `a433df5` | admin : onglet Pack photo + séparation par event + export CSV filtré |
| `165d449` | site + mail : bloc « T-shirt offert à chaque athlète » |
| `4164b0e` | mail : template unique partagé (`lib/email-template.js`) |
| `f6704ce` | site : **ouverture des inscriptions** — boutons « Inscriptions ici » |
