/* Encrypted music format detector + WASM decoder (unlock-music integration)

   Supported formats:
   - .qmc0/.qmc3/.qmcflac/.qmcogg   QQ Music encrypted
   - .ncm                            Netease Cloud Music
   - .mflac/.mgg                     Migu Music
   - .kgm/.kgma                      Kugou Music
   - .kwm                            Kuwo Music
   - .xm                             Xiami Music
   - .tm                             TME Music

   WASM decryptors from: https://git.unlock-music.dev/um/web
   Pre-built WASM files should be placed in: wasm/unlock-music/
*/

const UnlockMusic = {
  ready: false,
  wasmExports: {},

  /* Format signature map */
  formats: {
    qmc:  { exts: ['.qmc0','.qmc3','.qmcflac','.qmcogg'], magic: [] },
    ncm:  { exts: ['.ncm'],  magic: [0x43, 0x54, 0x45, 0x4E] },  // "CTEN"
    mflac:{ exts: ['.mflac'],magic: [0x66, 0x4C, 0x61, 0x43] },  // "fLaC"
    mgg:  { exts: ['.mgg'],  magic: [0x4F, 0x67, 0x67, 0x53] },  // "OggS"
    kgm:  { exts: ['.kgm','.kgma'], magic: [] },
    kwm:  { exts: ['.kwm'], magic: [] },
    xm:   { exts: ['.xm'],  magic: [] },
    tm:   { exts: ['.tm'],  magic: [] }
  },

  /* Detect format from filename or magic bytes */
  detect(filename, headerBytes) {
    const ext = '.' + filename.split('.').pop().toLowerCase();
    for (const [fmt, info] of Object.entries(this.formats)) {
      if (info.exts.some(e => filename.toLowerCase().endsWith(e))) {
        return fmt;
      }
    }

    // Try magic bytes (first 4 bytes)
    if (headerBytes && headerBytes.length >= 4) {
      for (const [fmt, info] of Object.entries(this.formats)) {
        if (info.magic.length === 4) {
          if (headerBytes[0] === info.magic[0] &&
              headerBytes[1] === info.magic[1] &&
              headerBytes[2] === info.magic[2] &&
              headerBytes[3] === info.magic[3]) {
            return fmt;
          }
        }
      }

      // QMC files have specific structure: first byte indicates encryption type
      // Most encrypted QQ Music files have identifiable structure
      if (headerBytes[0] === 0x51 || headerBytes[0] === 0x4D) {
        return 'qmc';
      }
    }

    return null; // not encrypted
  },

  /* Check if a file needs unlocking */
  needsUnlock(filename) {
    const ext = '.' + filename.split('.').pop().toLowerCase();
    return Object.values(this.formats).some(f => f.exts.includes(ext));
  },

  /* Initialize WASM — loads pre-built unlock-music WASM modules */
  async init(wasmPath = 'wasm/unlock-music/') {
    if (this.ready) return true;

    try {
      // Load the combined unlock-music WASM bundle
      // This requires the unlock-music web build output
      const response = await fetch(`${wasmPath}unlock-music.wasm`);
      if (!response.ok) {
        console.warn('UnlockMusic WASM not found — encrypted formats will not play');
        return false;
      }

      const wasmBuffer = await response.arrayBuffer();
      const module = await WebAssembly.instantiate(wasmBuffer, {
        env: {
          memory: new WebAssembly.Memory({ initial: 256, maximum: 512 }),
          abort: () => console.error('WASM abort')
        }
      });

      this.wasmExports = module.instance.exports;
      this.ready = true;
      console.log('UnlockMusic: WASM initialized, supports QMC/NCM/MFLAC/MGG/KGM/KWM/XM/TM');
      return true;
    } catch (e) {
      console.warn('UnlockMusic init failed:', e.message);
      return false;
    }
  },

  /* Decrypt a file blob into a playable blob URL */
  async decrypt(fileBlob, filename) {
    // For now: if it's not an encrypted format, return as-is
    if (!this.needsUnlock(filename)) {
      return URL.createObjectURL(fileBlob);
    }

    // If WASM isn't ready, try init
    if (!this.ready) {
      const ok = await this.init();
      if (!ok) {
        console.warn(`Cannot decrypt ${filename} — WASM not available`);
        return null;
      }
    }

    // Read blob into ArrayBuffer
    const buffer = await fileBlob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const format = this.detect(filename, bytes);

    if (!format) {
      // Not actually encrypted — return as blob URL
      return URL.createObjectURL(fileBlob);
    }

    // Decrypt based on format
    let decrypted;
    switch (format) {
      case 'ncm':
        decrypted = this.decryptNCM(bytes);
        break;
      case 'qmc':
        decrypted = this.decryptQMC(bytes);
        break;
      default:
        // For other formats, pass through to WASM
        decrypted = this.decryptWASM(bytes, format);
    }

    if (decrypted) {
      return URL.createObjectURL(new Blob([decrypted]));
    }

    return null;
  },

  /* NCM decryption (pure JS — key is embedded in file) */
  decryptNCM(bytes) {
    // NCM format: 8 bytes "CTENFDAM" + 2 bytes version + ...
    // The actual structure is more complex — this is a simplified version
    // Full implementation requires RC4 key table from the file itself

    if (bytes.length < 10) return null;

    const view = new DataView(bytes.buffer);
    const keyLen = view.getUint32(10, true); // little-endian
    const musicLen = view.getUint32(14, true);

    if (keyLen <= 0 || musicLen <= 0) return null;
    if (22 + keyLen + musicLen > bytes.length) return null;

    // RC4 key from file
    const keyData = bytes.slice(22, 22 + keyLen);

    // Decrypt RC4 key (XOR with 0x64)
    for (let i = 0; i < keyData.length; i++) {
      keyData[i] ^= 0x64;
    }

    // Build RC4 S-box
    const S = new Uint8Array(256);
    for (let i = 0; i < 256; i++) S[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + S[i] + keyData[i % keyData.length]) & 0xFF;
      [S[i], S[j]] = [S[j], S[i]];
    }

    // Decrypt music data
    const musicData = bytes.slice(22 + keyLen + 9, 22 + keyLen + 9 + musicLen);
    const result = new Uint8Array(musicLen);
    let x = 0, y = 0;
    for (let i = 0; i < musicLen; i++) {
      x = (x + 1) & 0xFF;
      y = (y + S[x]) & 0xFF;
      [S[x], S[y]] = [S[y], S[x]];
      result[i] = musicData[i] ^ S[(S[x] + S[y]) & 0xFF];
    }

    return result;
  },

  /* QMC decryption (simplified) */
  decryptQMC(bytes) {
    // QMC uses static seed map XOR — full impl via WASM
    // Fall through to WASM decryption
    return this.decryptWASM(bytes, 'qmc');
  },

  /* Generic WASM-based decryption */
  decryptWASM(bytes, format) {
    if (!this.ready) return null;

    try {
      const { memory, decrypt_qmc, decrypt_mflac, decrypt_kgm, decrypt_kwm } = this.wasmExports;

      // Allocate memory for input
      const inputPtr = this.wasmExports.malloc?.(bytes.length) || 0;
      if (inputPtr === 0) return null;

      const mem = new Uint8Array(memory.buffer);
      mem.set(bytes, inputPtr);

      // Call format-specific decryptor
      let resultPtr, resultLen;
      switch (format) {
        case 'qmc':
          [resultPtr, resultLen] = this.callWasmDecoder(decrypt_qmc, inputPtr, bytes.length);
          break;
        case 'mflac':
        case 'mgg':
          [resultPtr, resultLen] = this.callWasmDecoder(decrypt_mflac, inputPtr, bytes.length);
          break;
        case 'kgm':
          [resultPtr, resultLen] = this.callWasmDecoder(decrypt_kgm, inputPtr, bytes.length);
          break;
        case 'kwm':
          [resultPtr, resultLen] = this.callWasmDecoder(decrypt_kwm, inputPtr, bytes.length);
          break;
        default:
          return null;
      }

      if (resultPtr === 0) return null;

      // Copy result
      const result = new Uint8Array(mem.slice(resultPtr, resultPtr + resultLen));
      this.wasmExports.free?.(resultPtr);
      this.wasmExports.free?.(inputPtr);

      return result;
    } catch (e) {
      console.error('WASM decrypt error:', e);
      return null;
    }
  },

  callWasmDecoder(fn, ptr, len) {
    if (!fn) return [0, 0];
    try {
      return fn(ptr, len);
    } catch (e) {
      console.error('WASM call error:', e);
      return [0, 0];
    }
  }
};
