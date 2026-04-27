/* Focus Mode — fullscreen immersive listening */
const FocusMode = {
  active: false,
  lyricsActiveIdx: -1,

  enter() {
    if (this.active) return;
    this.active = true;

    const overlay = document.getElementById('focus-overlay');
    if (!overlay) return;

    const track = MusicPlayer.getTrack();
    if (!track) return;

    // Set background to album cover
    const bg = document.getElementById('focus-bg');
    if (bg) {
      const coverWrap = document.getElementById('home-cover-wrap');
      const img = coverWrap ? coverWrap.querySelector('img') : null;
      if (img && img.src) {
        bg.style.backgroundImage = `url(${img.src})`;
      } else {
        // Fallback — use SVG placeholder as background via data URI
        const svgData = AlbumArt.getSVG(track);
        bg.style.backgroundImage = `url('data:image/svg+xml,${encodeURIComponent(svgData)}')`;
      }
    }

    // Show overlay
    overlay.classList.remove('hidden');

    // Trigger animation
    overlay.style.animation = 'none';
    overlay.offsetHeight; // force reflow
    overlay.style.animation = 'focusEnter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';

    // Bind focus controls
    this.bindControls();

    // Start lyrics sync
    this.startLyricsSync();

    // Hide player bar
    const playerBar = document.getElementById('player-bar');
    if (playerBar) playerBar.style.display = 'none';

    // Pause home lyrics sync
    Lyrics.stopSync();
    if (this._homeSyncHandle) {
      cancelAnimationFrame(this._homeSyncHandle);
    }
  },

  exit() {
    if (!this.active) return;
    this.active = false;

    const overlay = document.getElementById('focus-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }

    // Remove ESC listener
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }

    // Stop focus lyrics sync
    Lyrics.stopSync();
    if (this._focusSyncHandle) {
      cancelAnimationFrame(this._focusSyncHandle);
      this._focusSyncHandle = null;
    }

    // Show player bar
    const playerBar = document.getElementById('player-bar');
    if (playerBar) playerBar.style.display = '';

    // Restart home lyrics sync if on home page
    if (App.currentView === 'home') {
      Lyrics.startSync((activeIdx) => {
        if (activeIdx !== PlayerHome.lyricsActiveIdx) {
          PlayerHome.lyricsActiveIdx = activeIdx;
          const preview = document.getElementById('home-lyrics-preview');
          if (preview) {
            preview.innerHTML = PlayerHome.renderLyricsPreview();
          }
        }
      });
    }
  },

  bindControls() {
    const btnPlay = document.getElementById('focus-btn-play');
    const btnPrev = document.getElementById('focus-btn-prev');
    const btnNext = document.getElementById('focus-btn-next');
    const btnExit = document.getElementById('focus-exit');
    const trackEl = document.getElementById('focus-track');

    // Remove old listeners by cloning (simple approach)
    const cloneAndReplace = (el) => {
      if (!el) return;
      const clone = el.cloneNode(true);
      el.parentNode.replaceChild(clone, el);
      return clone;
    };

    const newExit = cloneAndReplace(btnExit);
    const newPlay = cloneAndReplace(btnPlay);
    const newPrev = cloneAndReplace(btnPrev);
    const newNext = cloneAndReplace(btnNext);
    const newTrack = cloneAndReplace(trackEl);

    if (newExit) newExit.addEventListener('click', () => this.exit());
    if (newPlay) newPlay.addEventListener('click', () => MusicPlayer.toggle());
    if (newPrev) newPrev.addEventListener('click', () => MusicPlayer.prev());
    if (newNext) newNext.addEventListener('click', () => MusicPlayer.next());

    // Progress bar
    if (newTrack) {
      newTrack.addEventListener('click', (e) => {
        const rect = newTrack.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        MusicPlayer.seek(pct * (MusicPlayer.duration || 0));
      });
    }

    // Sync time/play state
    MusicPlayer.on('timeupdate', () => this.updateProgress());
    MusicPlayer.on('play', () => this.updatePlayBtn());
    MusicPlayer.on('pause', () => this.updatePlayBtn());

    this.updatePlayBtn();
    this.updateProgress();

    // ESC key to exit
    this._escHandler = (e) => {
      if (e.key === 'Escape') this.exit();
    };
    document.addEventListener('keydown', this._escHandler);
  },

  updateProgress() {
    const timeEl = document.getElementById('focus-time');
    const durEl = document.getElementById('focus-duration');
    const fillEl = document.getElementById('focus-fill');
    const d = MusicPlayer.duration || 0;
    const t = MusicPlayer.currentTime;

    if (timeEl) timeEl.textContent = formatTime(t);
    if (durEl) durEl.textContent = formatTime(d);
    if (fillEl) fillEl.style.width = d ? `${(t / d) * 100}%` : '0%';
  },

  updatePlayBtn() {
    const btn = document.getElementById('focus-btn-play');
    if (btn) btn.textContent = MusicPlayer.isPlaying ? '⏸' : '▶';
  },

  startLyricsSync() {
    if (!this.active) return;

    const container = document.getElementById('focus-lyrics');
    if (!container) return;

    const renderFn = (activeIdx) => {
      if (!this.active) return;
      if (activeIdx !== this.lyricsActiveIdx) {
        this.lyricsActiveIdx = activeIdx;
        Lyrics.renderLines(container, activeIdx, (line, i, active) => {
          const isActive = i === active;
          return `<div class="focus-lyric-line${isActive ? ' active' : ''}">${line.text}</div>`;
        });
      }
    };

    Lyrics.startSync(renderFn);

    // Initial render
    if (Lyrics.lines.length) {
      Lyrics.renderLines(container, 0, (line, i, active) => {
        const isActive = i === active;
        return `<div class="focus-lyric-line${isActive ? ' active' : ''}">${line.text}</div>`;
      });
    } else {
      container.innerHTML = '<div class="focus-lyric-line" style="color:rgba(255,255,255,0.5);text-align:center">暂无歌词</div>';
    }
  }
};
