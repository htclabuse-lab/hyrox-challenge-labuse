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

export function modelesCharges() {
  return !!modelesPrets;
}

export function chargerModeles() {
  if (!modelesPrets) {
    modelesPrets = (async () => {
      faceapi = await import(FACE_API);
      let gpu = false;
      try { gpu = await faceapi.tf.setBackend('webgl'); } catch (e) {}
      if (!gpu) await faceapi.tf.setBackend('cpu'); // vieux téléphones : plus lent mais ça marche
      await faceapi.tf.ready();
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODELES),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODELES),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODELES),
      ]);
    })();
    modelesPrets.catch(() => { modelesPrets = null; });
  }
  return modelesPrets;
}

async function chargerImage(fichier) {
  try {
    return await createImageBitmap(fichier, { imageOrientation: 'from-image' });
  } catch (e) {
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

// Renvoie l'empreinte du plus grand visage de la photo, ou null si aucun visage.
export async function empreinteDuSelfie(fichier) {
  await chargerModeles();
  const image = await chargerImage(fichier);
  const w = image.width || image.naturalWidth, h = image.height || image.naturalHeight;
  const r = Math.min(1, 1200 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * r); c.height = Math.round(h * r);
  c.getContext('2d').drawImage(image, 0, 0, c.width, c.height);
  if (image.close) image.close();
  const visages = await faceapi.detectAllFaces(c, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks().withFaceDescriptors();
  if (!visages.length) return null;
  // Plusieurs visages ? On garde le plus grand (celui du selfie).
  visages.sort((a, b) => b.detection.box.area - a.detection.box.area);
  return Array.from(visages[0].descriptor).map(v => Math.round(v * 1e6) / 1e6);
}
