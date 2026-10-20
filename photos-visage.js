// ============================================================================
// Plateforme photos — reconnaissance du selfie, DANS LE NAVIGATEUR.
// Partagé par photos.html et photos-espace.html.
// Le selfie ne quitte jamais l'appareil : on n'en sort qu'une « empreinte »
// (128 nombres) qui sert à la recherche.
// ============================================================================

// La reconnaissance (~1 Mo de code + ~12 Mo de modèles) n'est téléchargée qu'au
// premier besoin : les pages s'affichent tout de suite.
const FACE_API = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.esm.js';
const MODELES = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/';

let faceapi = null;
let modelesPrets = null;

// Mode diagnostic (adresse avec ?diag=1) : la page affiche ce que la reconnaissance
// a vu, pour comprendre un échec sur un téléphone qu'on n'a pas sous la main.
// Rien n'est envoyé : tout reste affiché sur l'appareil.
export const diagnostic = { actif: false, lignes: [], apercu: null };
function noter(texte) {
  if (diagnostic.actif) diagnostic.lignes.push(texte);
}

export function modelesCharges() {
  return !!modelesPrets;
}

function chargerReseaux() {
  return Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODELES),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODELES),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODELES),
  ]);
}

// Mode secours : certaines cartes graphiques (ex. Mali-G610 de nombreux Xiaomi /
// Samsung) abîment les données de la reconnaissance dès leur chargement. On
// recharge alors tout SANS carte graphique : plus lent, mais fiable, et avec le
// même détecteur que l'indexation (donc la même empreinte).
let modeSecours = false;
async function passerEnModeSecours() {
  await faceapi.tf.setBackend('cpu');
  await faceapi.tf.ready();
  await chargerReseaux();          // données rechargées proprement, en mémoire normale
  modeSecours = true;
  noter('→ mode secours : reconnaissance rechargée sans carte graphique (cpu)');
}

export function chargerModeles() {
  if (!modelesPrets) {
    modelesPrets = (async () => {
      faceapi = await import(FACE_API);
      let gpu = false;
      try { gpu = await faceapi.tf.setBackend('webgl'); } catch (e) {}
      if (!gpu) await faceapi.tf.setBackend('cpu'); // vieux téléphones : plus lent mais ça marche
      await faceapi.tf.ready();
      noter(`calcul : ${faceapi.tf.getBackend()} (carte graphique ${gpu ? 'OK' : 'refusée'})`);
      await chargerReseaux();
    })();
    modelesPrets.catch(() => { modelesPrets = null; });
  }
  return modelesPrets;
}

async function chargerImage(fichier) {
  noter(`fichier : ${fichier.type || '?'}, ${Math.round(fichier.size / 1024)} Ko`);
  try {
    const bmp = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
    noter(`lecture : createImageBitmap ${bmp.width}x${bmp.height}`);
    return bmp;
  } catch (e) {
    noter(`lecture : createImageBitmap a échoué (${e.message}), repli sur <img>`);
    const url = URL.createObjectURL(fichier);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// Copie de l'image tournée de 90°, 180° ou 270°.
function tourner(source, degres) {
  const c = document.createElement('canvas');
  const droit = degres % 180 !== 0;
  c.width = droit ? source.height : source.width;
  c.height = droit ? source.width : source.height;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(degres * Math.PI / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return c;
}

// Le plus grand visage de l'image : { empreinte, score } ou null.
async function plusGrandVisage(canvas) {
  const visages = await faceapi.detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks().withFaceDescriptors();
  if (diagnostic.actif) {
    const faibles = await faceapi.detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 }));
    noter(`  ${canvas.width}x${canvas.height} : ${visages.length} visage(s) ; scores bruts : ${faibles.map(f => f.score.toFixed(2)).join(', ') || 'aucun'}`);
  }
  if (!visages.length) return null;
  // Plusieurs visages ? On garde le plus grand (celui du selfie).
  visages.sort((a, b) => b.detection.box.area - a.detection.box.area);
  return {
    empreinte: Array.from(visages[0].descriptor).map(v => Math.round(v * 1e6) / 1e6),
    score: visages[0].detection.score,
  };
}

// Certains Android livrent le selfie « couché » : on essaie les 4 sens et on garde
// la détection la plus sûre (un visage couché peut être détecté, mais mal).
// Si l'image droite est déjà très nette, inutile d'essayer les autres sens.
async function chercherDansTousLesSens(canvas, sens = [0, 90, 270, 180]) {
  let meilleur = null;
  for (const degres of sens) {
    noter(`sens ${degres}° :`);
    const v = await plusGrandVisage(degres ? tourner(canvas, degres) : canvas);
    if (v && (!meilleur || v.score > meilleur.score)) meilleur = v;
    if (degres === 0 && v && v.score > 0.9) break;
  }
  return meilleur ? meilleur.empreinte : null;
}

// Renvoie l'empreinte du plus grand visage de la photo, ou null si aucun visage.
// avertir(texte) : facultatif, pour prévenir l'utilisateur si ça va être long.
export async function empreinteDuSelfie(fichier, avertir = () => {}) {
  await chargerModeles();
  const image = await chargerImage(fichier);
  const w = image.width || image.naturalWidth, h = image.height || image.naturalHeight;
  const r = Math.min(1, 1200 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * r); c.height = Math.round(h * r);
  c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
  if (image.close) image.close();
  if (diagnostic.actif) {
    const p = document.createElement('canvas');
    const rp = 160 / Math.max(c.width, c.height);
    p.width = Math.round(c.width * rp); p.height = Math.round(c.height * rp);
    p.getContext('2d').drawImage(c, 0, 0, p.width, p.height);
    diagnostic.apercu = p.toDataURL('image/jpeg', 0.7);
  }

  // En mode secours, chaque essai est lent : on ne teste que le sens normal (la
  // photo est déjà remise droite à la lecture).
  if (modeSecours) {
    avertir('Ton téléphone a besoin d\'un peu plus de temps… (jusqu\'à une minute)');
    return chercherDansTousLesSens(c, [0]);
  }
  let e = await chercherDansTousLesSens(c);
  // Rien trouvé : peut-être une carte graphique défaillante. On réessaie en mode
  // secours, et on y reste pour les recherches suivantes.
  if (!e && faceapi.tf.getBackend() !== 'cpu') {
    avertir('Ton téléphone a besoin d\'un peu plus de temps… (jusqu\'à une minute)');
    await passerEnModeSecours();
    e = await chercherDansTousLesSens(c, [0]);
  }
  return e;
}
