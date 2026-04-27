/* Home page — music player area (cover + controls + lyrics preview + focus button) */
const PlayerHome = {
  lyricsActiveIdx: -1,

  render(container) {
    const track = MusicPlayer.getTrack();
    const hasTrack = track !== null;

    container.innerHTML = `
      <div class="view active anim-slide-up">
        <div class="home-container">
          <div class="home-cover-wrap" id="home-cover-wrap">
            ${this.renderCover(track)}
          </div>

          <div class="home-song-info">
            <h2 class="home-song-title" id="home-title">
              ${hasTrack ? track.title : '未在播放'}
            </h2>
            <p class="home-song-artist" id="home-artist">
              ${hasTrack ? track.artist : '选择一首歌开始吧'}
            </p>
          </div>

          <div class="home-controls">
            <button class="home-ctrl-btn" id="home-btn-prev">⏮</button>
            <button class="home-ctrl-btn home-ctrl-main" id="home-btn-play">
              ${MusicPlayer.isPlaying ? '⏸' : '▶'}
            </button>
            <button class="home-ctrl-btn" id="home-btn-next">⏭</button>
          </div>

          <div class="home-progress">
            <span id="home-time">${formatTime(MusicPlayer.currentTime)}</span>
            <div class="home-progress-track" id="home-progress-track">
              <div class="home-progress-fill" id="home-progress-fill" style="width:${this.pct()}%"></div>
            </div>
            <span id="home-duration">${formatTime(MusicPlayer.duration || 0)}</span>
          </div>

          <div class="home-lyrics-preview" id="home-lyrics-preview">
            ${this.renderLyricsPreview()}
          </div>

          <button class="btn-focus-mode" id="home-btn-focus">
            🎧 专注听歌
          </button>
        </div>
      </div>
    `;

    this.bindEvents();
    this.startLyricsSync();
  },

  renderCover(track) {
    if (track) {
      return AlbumArt.getImg(track);
    }
    return `
      <div class="home-cover-placeholder">
        <span class="ph-x">×</span>
        <span class="ph-text">OK COMPUTER</span>
      </div>`;
  },

  renderLyricsPreview() {
    if (!Lyrics.lines.length) {
      return '<div class="home-lyric-line" style="color:var(--text-muted)">歌词加载中…</div>';
    }

    const idx = Math.max(0, this.lyricsActiveIdx);
    const windowSize = 5;
    const half = Math.floor(windowSize / 2);
    let start = Math.max(0, idx - half);
    const end = Math.min(Lyrics.lines.length, start + windowSize);

    return Lyrics.lines.slice(start, end)
      .map((l, i) => {
        const actualIdx = start + i;
        const isActive = actualIdx === idx;
        return `<div class="home-lyric-line${isActive ? ' active' : ''}">${l.text}</div>`;
      })
      .join('');
  },

  pct() {
    const d = MusicPlayer.duration || 0;
    return d ? (MusicPlayer.currentTime / d) * 100 : 0;
  },

  bindEvents() {
    // Play/pause
    const btnPlay = document.getElementById('home-btn-play');
    if (btnPlay) {
      btnPlay.addEventListener('click', () => MusicPlayer.toggle());
    }

    // Prev/next
    const btnPrev = document.getElementById('home-btn-prev');
    const btnNext = document.getElementById('home-btn-next');
    if (btnPrev) btnPrev.addEventListener('click', () => MusicPlayer.prev());
    if (btnNext) btnNext.addEventListener('click', () => MusicPlayer.next());

    // Progress bar seek
    const progressTrack = document.getElementById('home-progress-track');
    if (progressTrack) {
      progressTrack.addEventListener('click', (e) => {
        const rect = progressTrack.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        MusicPlayer.seek(pct * (MusicPlayer.duration || 0));
      });
    }

    // Focus mode button
    const btnFocus = document.getElementById('home-btn-focus');
    if (btnFocus) {
      btnFocus.addEventListener('click', () => {
        if (typeof FocusMode !== 'undefined') {
          FocusMode.enter();
        }
      });
    }

    // Cover click - also toggle play
    const coverWrap = document.getElementById('home-cover-wrap');
    if (coverWrap) {
      coverWrap.addEventListener('click', () => MusicPlayer.toggle());
      coverWrap.style.cursor = 'pointer';
    }

    // Sync listeners
    MusicPlayer.on('timeupdate', () => this.updateProgress());
    MusicPlayer.on('play', () => this.updatePlayBtn());
    MusicPlayer.on('pause', () => this.updatePlayBtn());
    MusicPlayer.on('trackchange', () => this.updateTrackInfo());
  },

  updateProgress() {
    const timeEl = document.getElementById('home-time');
    const fillEl = document.getElementById('home-progress-fill');
    if (timeEl) timeEl.textContent = formatTime(MusicPlayer.currentTime);
    if (fillEl) fillEl.style.width = `${this.pct()}%`;
  },

  updatePlayBtn() {
    const btn = document.getElementById('home-btn-play');
    if (btn) btn.textContent = MusicPlayer.isPlaying ? '⏸' : '▶';

    // Vinyl spin on cover
    const cover = document.querySelector('.home-cover');
    if (cover) {
      cover.classList.toggle('playing', MusicPlayer.isPlaying);
    }
  },

  updateTrackInfo() {
    const track = MusicPlayer.getTrack();
    if (!track) return;

    const titleEl = document.getElementById('home-title');
    const artistEl = document.getElementById('home-artist');
    const coverWrap = document.getElementById('home-cover-wrap');

    if (titleEl) titleEl.textContent = track.title;
    if (artistEl) artistEl.textContent = track.artist;
    if (coverWrap) coverWrap.innerHTML = this.renderCover(track);

    const durEl = document.getElementById('home-duration');
    // Duration updates via loadedmetadata
    MusicPlayer.on('loadedmetadata', () => {
      if (durEl) durEl.textContent = formatTime(MusicPlayer.duration || 0);
    });

    // Load lyrics
    Lyrics.load(track.id).then(() => {
      this.startLyricsSync();
    });
  },

  startLyricsSync() {
    Lyrics.startSync((activeIdx) => {
      if (activeIdx !== this.lyricsActiveIdx) {
        this.lyricsActiveIdx = activeIdx;
        const preview = document.getElementById('home-lyrics-preview');
        if (preview) {
          preview.innerHTML = this.renderLyricsPreview();
        }
      }
    });
  }
};
