// ============================================================================
// Cloudflare R2 — fabrication des « tickets » (liens signés temporaires).
//
// La boîte `htc-photos` est privée : on n'y accède qu'avec un lien signé, valable
// quelques minutes, que seul le serveur sait fabriquer (il a la clé secrète).
//   lienSigne('PUT', cle)  → l'indexeur dépose un fichier
//   lienSigne('GET', cle)  → un athlète affiche / télécharge une photo
//
// Signature AWS « SigV4 » (R2 parle le même langage qu'Amazon S3), écrite à la
// main avec WebCrypto pour ne pas ajouter de dépendance au projet.
// Variables Vercel : R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
// ============================================================================

import { webcrypto } from 'node:crypto';

const crypto = globalThis.crypto ?? webcrypto;
const enc = new TextEncoder();

// Encodage d'URL « strict » exigé par la signature (RFC 3986).
function encode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(texte) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(texte)));
}

async function hmac(cle, texte) {
  const k = await crypto.subtle.importKey('raw', typeof cle === 'string' ? enc.encode(cle) : cle,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(texte));
}

// Version générique (testable avec les exemples officiels d'Amazon).
export async function presigner({ methode, hote, chemin, region, accessKeyId, secretAccessKey,
                                  expireSecondes = 600, date = new Date(), extraQuery = {} }) {
  const amzDate = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20261020T120000Z
  const jour = amzDate.slice(0, 8);
  const portee = `${jour}/${region}/s3/aws4_request`;

  const params = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${portee}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expireSecondes),
    'X-Amz-SignedHeaders': 'host',
    ...extraQuery,
  };
  const query = Object.keys(params).sort()
    .map(k => `${encode(k)}=${encode(params[k])}`).join('&');
  const cheminEncode = chemin.split('/').map(encode).join('/');

  const requeteCanonique = [methode, cheminEncode, query, `host:${hote}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const aSigner = ['AWS4-HMAC-SHA256', amzDate, portee, await sha256Hex(requeteCanonique)].join('\n');

  let cleSignature = await hmac('AWS4' + secretAccessKey, jour);
  cleSignature = await hmac(cleSignature, region);
  cleSignature = await hmac(cleSignature, 's3');
  cleSignature = await hmac(cleSignature, 'aws4_request');
  const signature = hex(await hmac(cleSignature, aSigner));

  return `https://${hote}${cheminEncode}?${query}&X-Amz-Signature=${signature}`;
}

// Lien signé vers un fichier de la boîte R2 du projet.
//   options.telechargerSous : nom de fichier proposé au téléchargement (GET uniquement)
export function lienSigne(methode, cle, { expireSecondes = 600, telechargerSous } = {}) {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error('Configuration R2 incomplète (variables Vercel)');
  }
  const extraQuery = telechargerSous
    ? { 'response-content-disposition': `attachment; filename="${telechargerSous.replace(/"/g, '')}"` }
    : {};
  return presigner({
    methode,
    hote: `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    chemin: `/${R2_BUCKET}/${cle}`,
    region: 'auto',
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    expireSecondes,
    extraQuery,
  });
}

// Emplacements des 3 versions d'une photo dans la boîte.
export function clesPhoto(evenementId, photoId) {
  return {
    hd: `${evenementId}/hd/${photoId}.jpg`,
    web: `${evenementId}/web/${photoId}.jpg`,
    apercu: `${evenementId}/apercu/${photoId}.jpg`,
  };
}
