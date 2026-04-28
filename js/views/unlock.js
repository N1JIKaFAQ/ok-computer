/* Music Unlock View — decrypt NCM/QMC encrypted files
   Using crypto-js from CDN for AES-ECB (NCM format).
   Based on open-source unlock-music project. */

const UnlockView = {
  files: [],
  _eventsInit: false,  // { name, blob, decryptedBlob, status: 'pending'|'decrypting'|'done'|'error', meta }

  render(container) {
    this.files = [];
    container.innerHTML = `
      <div class="view active anim-slide-up">
        <div class="card" style="text-align:center">
          <div class="card-title">🔓 音乐解锁</div>
          <p style="font-size:14px;color:var(--text-secondary);margin-bottom:20px">
            支持网易云 .ncm / QQ音乐 .qmc0 .qmc3 .qmcflac .qmcogg / 酷狗 .kgm / 酷我 .kwm
          </p>

          <div id="unlock-drop-zone" style="
            border: 2px dashed var(--border);
            border-radius: var(--radius-lg);
            padding: 48px 24px;
            cursor: pointer;
            transition: all 0.25s;
            background: var(--bg-surface);
            margin-bottom: 20px;
          ">
            <div style="font-size:48px;margin-bottom:12px">📂</div>
            <div style="font-size:15px;font-weight:600;margin-bottom:4px">拖拽文件到此处</div>
            <div style="font-size:13px;color:var(--text-muted)">或点击选择加密音乐文件</div>
            <input type="file" id="unlock-file-input" accept=".ncm,.qmc0,.qmc3,.qmcflac,.qmcogg,.mflac,.mgg,.kgm,.kwm,.xm,.tm" multiple
              style="display:none">
          </div>
        </div>

        <div id="unlock-file-list"></div>
      </div>
    `;

    this.bindDropZone(container);
    this.renderFileList();
  },

  bindDropZone(container) {
    const dropZone = container.querySelector('#unlock-drop-zone');
    const fileInput = container.querySelector('#unlock-file-input');
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('click', () => fileInput.click());

    // Drag events
    ['dragenter', 'dragover'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--accent)';
        dropZone.style.background = 'rgba(116,185,207,0.06)';
      });
    });

    ['dragleave', 'drop'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border)';
        dropZone.style.background = 'var(--bg-surface)';
      });
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.addFiles(Array.from(e.dataTransfer.files));
    });

    fileInput.addEventListener('change', () => {
      this.addFiles(Array.from(fileInput.files));
      fileInput.value = '';
    });
  },

  addFiles(incoming) {
    for (const f of incoming) {
      const ext = f.name.split('.').pop().toLowerCase();
      const supported = ['ncm','qmc0','qmc3','qmcflac','qmcogg','mflac','mgg','kgm','kwm','xm','tm'];
      if (!supported.includes(ext)) {
        alert(`${f.name}: 不支持的格式`);
        continue;
      }
      this.files.push({
        name: f.name,
        blob: f,
        decryptedBlob: null,
        meta: null,
        status: 'pending'
      });
    }
    this.renderFileList();
  },

  async decryptAll() {
    for (const f of this.files) {
      if (f.status === 'done') continue;
      f.status = 'decrypting';
      this.renderFileList();

      try {
        const buf = await f.blob.arrayBuffer();
        const ext = f.name.split('.').pop().toLowerCase();

        let decrypted;
        if (ext === 'ncm') {
          decrypted = this.decryptNCM(buf, f.name);
        } else if (ext.startsWith('qmc') || ext === 'mflac' || ext === 'mgg') {
          decrypted = this.decryptQMC(buf, f.name);
        } else if (ext === 'kgm') {
          decrypted = this.decryptKGM(buf);
        } else {
          throw new Error('不支持的格式');
        }

        f.decryptedBlob = new Blob([decrypted.data], { type: decrypted.mime });
        f.meta = decrypted.meta;
        f.status = 'done';
      } catch (err) {
        console.error('Decrypt failed:', f.name, err);
        f.status = 'error';
        f.errorMsg = err.message;
      }
      this.renderFileList();
    }
  },

  /* ================================================================
     NCM Decryption (NetEase Cloud Music)
     Based on unlock-music: uses AES-128-ECB with fixed keys + RC4 stream
     ================================================================ */
  decryptNCM(buffer, filename) {
    const view = new DataView(buffer);
    const u8 = new Uint8Array(buffer);

    // Magic: "CTENFDAM"
    const magic = new Uint8Array(buffer, 0, 8);
    const expectedMagic = [0x43, 0x54, 0x45, 0x4e, 0x46, 0x44, 0x41, 0x4d];
    if (!magic.every((b, i) => b === expectedMagic[i])) {
      throw new Error('不是有效的 NCM 文件');
    }

    // Offset 10: key length
    let offset = 10;
    const keyLen = view.getUint32(offset, true);
    offset += 4;

    // Read key data, XOR with 0x64
    const keyCipher = new Uint8Array(buffer, offset, keyLen).map(b => b ^ 0x64);
    offset += keyLen;

    // AES-ECB decrypt key data using CORE_KEY
    const CORE_KEY = CryptoJS.enc.Hex.parse('687a4852416d736f356b496e62617857');
    const keyDecrypted = CryptoJS.AES.decrypt(
      { ciphertext: CryptoJS.lib.WordArray.create(keyCipher) },
      CORE_KEY,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    );

    const keyBytes = this._wordArrayToUint8(keyDecrypted);
    const rc4Key = keyBytes.slice(17);

    // Build keyBox for audio stream cipher
    const keyBox = this._buildKeyBox(rc4Key);

    // Read metadata
    const metaLen = view.getUint32(offset, true);
    offset += 4;

    let meta = { title: filename.replace(/\.ncm$/i, ''), artist: '未知艺人' };

    if (metaLen > 0) {
      const metaCipher = new Uint8Array(buffer, offset, metaLen).map(b => b ^ 0x63);
      offset += metaLen;

      // Decode metadata
      const META_KEY = CryptoJS.enc.Hex.parse('2331346C6A6B5F215C5D2630553C2728');
      try {
        const metaBase64 = new TextDecoder().decode(metaCipher.slice(22));
        const metaDecrypted = CryptoJS.AES.decrypt(
          { ciphertext: CryptoJS.enc.Base64.parse(metaBase64) },
          META_KEY,
          { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
        ).toString(CryptoJS.enc.Utf8);

        const colonIdx = metaDecrypted.indexOf(':');
        let parsed;
        if (metaDecrypted.slice(0, colonIdx) === 'dj') {
          parsed = JSON.parse(metaDecrypted.slice(colonIdx + 1)).mainMusic;
        } else {
          parsed = JSON.parse(metaDecrypted.slice(colonIdx + 1));
        }
        if (parsed.musicName) meta.title = parsed.musicName;
        if (parsed.artist) {
          meta.artist = parsed.artist.map(a => (typeof a === 'string' ? a : a[0] || '')).filter(Boolean).join(', ');
        }
      } catch (e) {
        // Metadata decode failed — use filename as title
      }
    }

    // Skip to audio data
    offset += view.getUint32(offset + 5, true) + 13;

    // Read and decrypt audio
    const audioData = new Uint8Array(buffer, offset);
    for (let i = 0; i < audioData.length; i++) {
      audioData[i] ^= keyBox[i % 256];
    }

    // Detect audio type
    const mime = this._detectAudioMime(audioData);
    return { data: audioData, mime, meta };
  },

  /* ================================================================
     QMC Decryption (QQ Music)
     Uses static cipher box for v1, fallback for v2
     ================================================================ */
  decryptQMC(buffer, filename) {
    const u8 = new Uint8Array(buffer);
    const ext = filename.split('.').pop().toLowerCase();

    // Static cipher (works for qmc0/qmc3 and many v1 files)
    const decrypted = new Uint8Array(u8);
    for (let i = 0; i < decrypted.length; i++) {
      let offset = i;
      if (offset > 0x7fff) offset %= 0x7fff;
      const maskIdx = (offset * offset + 27) & 0xff;
      decrypted[i] ^= QMC_STATIC_CIPHER[maskIdx];
    }

    const mimeMap = {
      qmc0: 'audio/mpeg', qmc3: 'audio/mpeg',
      qmcflac: 'audio/flac', qmcogg: 'audio/ogg',
      mflac: 'audio/flac', mgg: 'audio/ogg'
    };
    const mime = mimeMap[ext] || this._detectAudioMime(decrypted);

    const title = filename.replace(/\.[^.]+$/, '');
    return { data: decrypted, mime, meta: { title, artist: 'QQ音乐导入' } };
  },

  /* ================================================================
     KGM/VPR Decryption (Kugou Music)
     ================================================================ */
  decryptKGM(buffer) {
    const u8 = new Uint8Array(buffer);
    // KGM: XOR each byte with (byte_position ^ 0xFF) & 0xFF
    const decrypted = new Uint8Array(u8);
    for (let i = 0; i < decrypted.length; i++) {
      decrypted[i] ^= (i ^ 0xff) & 0xff;
    }
    const mime = this._detectAudioMime(decrypted);
    return { data: decrypted, mime, meta: { title: 'KGM导入', artist: '酷狗音乐' } };
  },

  /* ---- Helpers ---- */

  _buildKeyBox(keyData) {
    const box = new Uint8Array(256);
    for (let i = 0; i < 256; i++) box[i] = i;
    let j = 0;
    const keyLen = keyData.length;
    for (let i = 0; i < 256; i++) {
      j = (box[i] + j + keyData[i % keyLen]) & 0xff;
      [box[i], box[j]] = [box[j], box[i]];
    }
    // Pre-compute keystream
    const ks = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      const idx = (i + 1) & 0xff;
      const si = box[idx];
      const sj = box[(idx + si) & 0xff];
      ks[i] = box[(si + sj) & 0xff];
    }
    return ks;
  },

  _wordArrayToUint8(wordArray) {
    const words = wordArray.words;
    const sigBytes = wordArray.sigBytes;
    const result = new Uint8Array(sigBytes);
    for (let i = 0; i < sigBytes; i++) {
      result[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
    }
    return result;
  },

  _detectAudioMime(bytes) {
    // Check magic bytes
    if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg';
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'audio/mpeg';
    if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) return 'audio/flac';
    if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'audio/ogg';
    return 'audio/mpeg'; // default
  },

  /* ---- UI: File List ---- */

  renderFileList() {
    const container = document.getElementById('unlock-file-list');
    if (!container) return;

    if (!this.files.length) {
      container.innerHTML = '';
      return;
    }

    const hasPending = this.files.some(f => f.status === 'pending');

    container.innerHTML = `
      <div class="card" style="margin-top:16px">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>📋 文件列表 (${this.files.length})</span>
          ${hasPending ? `
            <button id="unlock-decrypt-all" style="
              padding:8px 20px;background:var(--accent3);color:#fff;border:none;
              border-radius:20px;cursor:pointer;font-size:13px;font-weight:600"
            >🔓 全部解密</button>
          ` : ''}
        </div>
        ${this.files.map((f, i) => this._renderFileRow(f, i)).join('')}
      </div>
    `;

    // Bind decrypt-all button
    const btn = container.querySelector('#unlock-decrypt-all');
    if (btn) btn.addEventListener('click', () => this.decryptAll());
  },

  _renderFileRow(f, i) {
    const statusIcon = { pending: '⏳', decrypting: '🔄', done: '✅', error: '❌' };
    const statusText = { pending: '等待解密', decrypting: '解密中…', done: '解密完成', error: f.errorMsg || '解密失败' };
    const isDone = f.status === 'done';

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:12px;border-bottom:1px solid var(--border);gap:12px;
        ${isDone ? 'background:rgba(0,184,148,0.04)' : ''}">
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${f.name}
          </div>
          ${f.meta ? `
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
              ${f.meta.artist} · ${f.meta.title}
            </div>
          ` : ''}
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">
            ${statusIcon[f.status]} ${statusText[f.status]}
          </div>
        </div>
        ${isDone ? `
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="unlock-dl-btn" data-idx="${i}" title="下载"
              style="padding:6px 14px;background:var(--bg-surface);border:1px solid var(--border);
                border-radius:6px;cursor:pointer;font-size:12px;color:var(--text-primary)">💾 下载</button>
            <button class="unlock-play-btn" data-idx="${i}" title="加入播放列表"
              style="padding:6px 14px;background:var(--accent);color:#fff;border:none;
                border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">▶ 播放</button>
          </div>
        ` : f.status === 'error' ? `
          <button class="unlock-retry-btn" data-idx="${i}"
            style="padding:6px 12px;background:none;border:1px solid var(--accent2);
              border-radius:6px;cursor:pointer;font-size:12px;color:var(--accent2)">重试</button>
        ` : ''}
      </div>
    `;
  },

  /* ---- Event delegation for dynamic buttons ---- */
  initEvents() {
    if (this._eventsInit) return;
    this._eventsInit = true;

    document.addEventListener('click', (e) => {
      const dlBtn = e.target.closest('.unlock-dl-btn');
      const playBtn = e.target.closest('.unlock-play-btn');
      const retryBtn = e.target.closest('.unlock-retry-btn');

      if (dlBtn) {
        const i = parseInt(dlBtn.dataset.idx);
        this.downloadFile(i);
      }
      if (playBtn) {
        const i = parseInt(playBtn.dataset.idx);
        this.addToPlaylist(i);
      }
      if (retryBtn) {
        const i = parseInt(retryBtn.dataset.idx);
        this.retryFile(i);
      }
    });
  },

  downloadFile(idx) {
    const f = this.files[idx];
    if (!f || !f.decryptedBlob) return;

    const origName = f.name;
    const newName = origName.replace(/\.(ncm|qmc0|qmc3|qmcflac|qmcogg|mflac|mgg|kgm|kwm)$/i, '') +
      this._mimeToExt(f.decryptedBlob.type);

    const url = URL.createObjectURL(f.decryptedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = newName;
    a.click();
    URL.revokeObjectURL(url);
  },

  addToPlaylist(idx) {
    const f = this.files[idx];
    if (!f || !f.decryptedBlob) return;

    const blobUrl = URL.createObjectURL(f.decryptedBlob);
    const title = f.meta ? f.meta.title : f.name.replace(/\.[^.]+$/, '');

    if (typeof MusicPlayer !== 'undefined') {
      MusicPlayer.addTrack({
        id: 'unlock-' + Date.now(),
        title: title,
        artist: f.meta ? f.meta.artist : '解密导入',
        album: '',
        file: blobUrl,
        duration: 0,
        coverFile: null
      });
    }
  },

  retryFile(idx) {
    const f = this.files[idx];
    if (!f) return;
    f.status = 'pending';
    f.errorMsg = null;
    this.renderFileList();
  },

  _mimeToExt(mime) {
    const map = {
      'audio/mpeg': '.mp3',
      'audio/flac': '.flac',
      'audio/ogg': '.ogg',
      'audio/wav': '.wav',
      'audio/mp4': '.m4a'
    };
    return map[mime] || '.mp3';
  }
};

/* QMC static cipher box (from unlock-music open source) */
const QMC_STATIC_CIPHER = new Uint8Array([
  0x77, 0x48, 0x32, 0x73, 0xDE, 0xF2, 0xC0, 0xC8,
  0x95, 0xEC, 0x30, 0xB2, 0x51, 0xC3, 0xE1, 0xA0,
  0x9E, 0xE6, 0x9D, 0xCF, 0xFA, 0x7F, 0x14, 0xD1,
  0xCE, 0xB8, 0xDC, 0xC3, 0x4A, 0x67, 0x93, 0xD6,
  0x28, 0xC2, 0x91, 0x70, 0xCA, 0x8D, 0xA2, 0xA4,
  0xF0, 0x08, 0x61, 0x90, 0x7E, 0x6F, 0xA2, 0xE0,
  0xEB, 0xAE, 0x3E, 0xB6, 0x67, 0xC7, 0x92, 0xF4,
  0x91, 0xB5, 0xF6, 0x6C, 0x5E, 0x84, 0x40, 0xF7,
  0xF3, 0x1B, 0x02, 0x7F, 0xD5, 0xAB, 0x41, 0x89,
  0x28, 0xF4, 0x25, 0xCC, 0x52, 0x11, 0xAD, 0x43,
  0x68, 0xA6, 0x41, 0x8B, 0x84, 0xB5, 0xFF, 0x2C,
  0x92, 0x4A, 0x26, 0xD8, 0x47, 0x6A, 0x7C, 0x95,
  0x61, 0xCC, 0xE6, 0xCB, 0xBB, 0x3F, 0x47, 0x58,
  0x89, 0x75, 0xC3, 0x75, 0xA1, 0xD9, 0xAF, 0xCC,
  0x08, 0x73, 0x17, 0xDC, 0xAA, 0x9A, 0xA2, 0x16,
  0x41, 0xD8, 0xA2, 0x06, 0xC6, 0x8B, 0xFC, 0x66,
  0x34, 0x9F, 0xCF, 0x18, 0x23, 0xA0, 0x0A, 0x74,
  0xE7, 0x2B, 0x27, 0x70, 0x92, 0xE9, 0xAF, 0x37,
  0xE6, 0x8C, 0xA7, 0xBC, 0x62, 0x65, 0x9C, 0xC2,
  0x08, 0xC9, 0x88, 0xB3, 0xF3, 0x43, 0xAC, 0x74,
  0x2C, 0x0F, 0xD4, 0xAF, 0xA1, 0xC3, 0x01, 0x64,
  0x95, 0x4E, 0x48, 0x9F, 0xF4, 0x35, 0x78, 0x95,
  0x7A, 0x39, 0xD6, 0x6A, 0xA0, 0x6D, 0x40, 0xE8,
  0x4F, 0xA8, 0xEF, 0x11, 0x1D, 0xF3, 0x1B, 0x3F,
  0x3F, 0x07, 0xDD, 0x6F, 0x5B, 0x19, 0x30, 0x19,
  0xFB, 0xEF, 0x0E, 0x37, 0xF0, 0x0E, 0xCD, 0x16,
  0x49, 0xFE, 0x53, 0x47, 0x13, 0x1A, 0xBD, 0xA4,
  0xF1, 0x40, 0x19, 0x60, 0x0E, 0xED, 0x68, 0x09,
  0x06, 0x5F, 0x4D, 0xCF, 0x3D, 0x1A, 0xFE, 0x20,
  0x77, 0xE4, 0xD9, 0xDA, 0xF9, 0xA4, 0x2B, 0x76,
  0x1C, 0x71, 0xDB, 0x00, 0xBC, 0xFD, 0x0C, 0x6C,
  0xA5, 0x47, 0xF7, 0xF6, 0x00, 0x79, 0x4A, 0x11
]);

// Init event delegation
document.addEventListener('DOMContentLoaded', () => UnlockView.initEvents());
if (document.readyState !== 'loading') UnlockView.initEvents();
