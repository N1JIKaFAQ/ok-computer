/* MusicPlayer singleton — one HTMLAudioElement for the whole app */
const MusicPlayer = {
  audio: null,
  playlist: PLAYLIST,
  currentIndex: -1,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  listeners: [],

  init() {
    if (this.audio) return;
    this.audio = new Audio();
    this.audio.volume = 0.8;
    this.audio.preload = 'auto';

    this.audio.addEventListener('timeupdate', () => {
      this.currentTime = this.audio.currentTime;
      this.notify('timeupdate');
    });

    this.audio.addEventListener('loadedmetadata', () => {
      this.duration = this.audio.duration;
      this.notify('loadedmetadata');
    });

    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.notify('play');
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.notify('pause');
    });

    this.audio.addEventListener('ended', () => {
      this.notify('ended');
      this.next();
    });

    this.audio.addEventListener('error', (e) => {
      console.warn('Audio error:', e);
      this.notify('error');
    });

    // Render sidebar playlist
    this.renderPlaylist();

    // Wire up player bar buttons
    this.bindPlayerBar();
  },

  load(index) {
    if (index < 0 || index >= this.playlist.length) return;
    this.currentIndex = index;
    const track = this.playlist[index];
    this.audio.src = track.file;
    this.audio.load();
    this.notify('trackchange');
  },

  play(index) {
    if (index !== undefined && index !== this.currentIndex) {
      this.load(index);
    }
    if (this.currentIndex < 0) {
      this.load(0);
    }
    const promise = this.audio.play();
    if (promise) {
      promise.catch(err => console.warn('Play prevented:', err));
    }
  },

  pause() {
    this.audio.pause();
  },

  toggle() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  },

  next() {
    const next = (this.currentIndex + 1) % this.playlist.length;
    this.play(next);
  },

  prev() {
    const prev = this.currentIndex <= 0
      ? this.playlist.length - 1
      : this.currentIndex - 1;
    this.play(prev);
  },

  seek(time) {
    if (this.audio && isFinite(time)) {
      this.audio.currentTime = Math.max(0, Math.min(time, this.duration || 0));
    }
  },

  getTrack() {
    if (this.currentIndex < 0) return null;
    return this.playlist[this.currentIndex];
  },

  /* Observer pattern for UI sync */
  on(event, fn) {
    this.listeners.push({ event, fn });
  },

  off(event, fn) {
    this.listeners = this.listeners.filter(l => !(l.event === event && l.fn === fn));
  },

  notify(event) {
    this.listeners.forEach(l => {
      if (l.event === event) l.fn(this);
    });
  },

  /* Sidebar playlist */
  renderPlaylist() {
    const container = document.getElementById('playlist-items');
    if (!container) return;

    container.innerHTML = this.playlist.map((t, i) => `
      <div class="playlist-song" data-index="${i}" title="${t.title} — ${t.artist}">
        ${t.title} — ${t.artist}
      </div>
    `).join('');

    container.querySelectorAll('.playlist-song').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index);
        this.play(idx);
      });
    });

    this.on('trackchange', () => {
      container.querySelectorAll('.playlist-song').forEach((el, i) => {
        el.classList.toggle('active', i === this.currentIndex);
      });
    });
  },

  /* Bottom player bar controls */
  bindPlayerBar() {
    const btnPlay = document.getElementById('btn-play');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const btnFocus = document.getElementById('btn-focus');
    const trackEl = document.getElementById('player-bar-track');
    const coverEl = document.getElementById('player-bar-cover');
    const titleEl = document.getElementById('player-bar-title');
    const artistEl = document.getElementById('player-bar-artist');
    const timeEl = document.getElementById('player-bar-time');
    const durEl = document.getElementById('player-bar-duration');
    const fillEl = document.getElementById('player-bar-fill');

    if (btnPlay) btnPlay.addEventListener('click', () => this.toggle());
    if (btnPrev) btnPrev.addEventListener('click', () => this.prev());
    if (btnNext) btnNext.addEventListener('click', () => this.next());

    if (btnFocus) {
      btnFocus.addEventListener('click', () => {
        if (typeof FocusMode !== 'undefined') {
          FocusMode.enter();
        }
      });
    }

    if (trackEl) {
      trackEl.addEventListener('click', (e) => {
        const rect = trackEl.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        this.seek(pct * (this.duration || 0));
      });
    }

    // Sync UI
    this.on('timeupdate', () => {
      const t = this.currentTime;
      const d = this.duration || 0;
      if (timeEl) timeEl.textContent = formatTime(t);
      if (fillEl) fillEl.style.width = d ? `${(t / d) * 100}%` : '0%';
    });

    this.on('loadedmetadata', () => {
      if (durEl) durEl.textContent = formatTime(this.duration || 0);
    });

    this.on('trackchange', () => {
      const track = this.getTrack();
      if (track) {
        if (titleEl) titleEl.textContent = track.title;
        if (artistEl) artistEl.textContent = track.artist;
        if (coverEl) {
          const imgFile = track.coverFile;
          if (imgFile) {
            coverEl.innerHTML = `<img src="${imgFile}" alt="${track.album}">`;
          } else if (typeof AlbumArt !== 'undefined') {
            coverEl.innerHTML = AlbumArt.getSVG(track);
          } else {
            coverEl.innerHTML = okComputerPlaceholder();
          }
        }
      }
    });

    this.on('play', () => {
      if (btnPlay) btnPlay.textContent = '⏸';
    });

    this.on('pause', () => {
      if (btnPlay) btnPlay.textContent = '▶';
    });
  }
};

/* Shared helper */
function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function okComputerPlaceholder() {
  return `
    <div style="width:100%;height:100%;background:#fff;display:flex;align-items:center;justify-content:center;border:1px solid var(--border)">
      <span style="font-family:'Montserrat Alternates',sans-serif;font-size:10px;color:var(--text-muted);font-weight:700;">×</span>
    </div>`;
}
