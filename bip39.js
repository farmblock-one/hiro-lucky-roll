// BIP-39 mnemonic generation (128-bit entropy -> 12 words), mirrors the reference Python snippet.
(() => {
  const toBits = (bytes) => Array.from(bytes, (b) => b.toString(2).padStart(8, '0')).join('');
  const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

  async function fromEntropy(entropy, words) {
    if (words.length !== 2048) throw new Error('Wordlist must have 2048 words');
    if (entropy.length !== 16) throw new Error('Entropy must be 16 bytes');
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', entropy));
    const entropyBits = toBits(entropy);                 // 128 bits
    const checksumBits = toBits(hash).slice(0, 4);       // first 4 bits of SHA-256
    const combined = entropyBits + checksumBits;         // 132 bits
    const indices = [];
    for (let i = 0; i < combined.length; i += 11) indices.push(parseInt(combined.slice(i, i + 11), 2));
    return { entropyHex: hex(entropy), checksumBits, indices, words: indices.map((i) => words[i]) };
  }

  async function generate(words) {
    if (!(window.crypto && crypto.subtle)) throw new Error('Trình duyệt cần HTTPS (hoặc localhost) để dùng SHA-256.');
    return fromEntropy(crypto.getRandomValues(new Uint8Array(16)), words);
  }

  (typeof window !== 'undefined' ? window : globalThis).Bip39 = { fromEntropy, generate };
})();
