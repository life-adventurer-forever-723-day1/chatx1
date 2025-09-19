// Simple AES-GCM demo helpers (later we’ll swap for your custom logic)

export async function encryptMessage(message, key) {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, encoded);

  return { 
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))), 
    iv: Array.from(iv) 
  };
}

export async function decryptMessage(ciphertext, iv, key) {
  const binary = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, cryptoKey, binary);
  return new TextDecoder().decode(decrypted);
}
