// DEFAULT encryption helpers (RSA-OAEP using WebCrypto).
// You asked to use your own encryption logic — replace functions here
// with your own encrypt/decrypt/generate/export/import implementations.
// The app expects these functions to exist with the same signatures.

export async function generateKeyPair() {
  // returns { publicJwk, privateJwk }
  const keyPair = await window.crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"]
  );

  const publicJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateJwk = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
  return { publicJwk, privateJwk };
}

export async function importPublicKeyFromJwk(jwk) {
  return await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
}

export async function importPrivateKeyFromJwk(jwk) {
  return await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
}

export async function encryptWithPublicJwk(plainText, publicJwk) {
  const enc = new TextEncoder();
  const data = enc.encode(plainText);
  const key = await importPublicKeyFromJwk(publicJwk);
  const cipher = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, data);
  return btoa(String.fromCharCode(...new Uint8Array(cipher)));
}

export async function decryptWithPrivateJwk(b64Cipher, privateJwk) {
  const key = await importPrivateKeyFromJwk(privateJwk);
  const binary = Uint8Array.from(atob(b64Cipher), c => c.charCodeAt(0));
  const plain = await window.crypto.subtle.decrypt({ name: "RSA-OAEP" }, key, binary);
  return new TextDecoder().decode(plain);
}
