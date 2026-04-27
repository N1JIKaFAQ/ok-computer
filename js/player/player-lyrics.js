/* Lyrics engine — LRC parsing, rAF sync, rendering */
const Lyrics = {
  lines: [],        // [{time: float, text: string}]
  rawLRC: '',
  syncHandle: null,

  /* Parse LRC format:
     [mm:ss.xx]lyric text
     Supports multiple timestamps per line ([00:01.00][00:02.50]text) */
  parse(lrcString) {
    this.rawLRC = lrcString;
    this.lines = [];

    const lineRegex = /\[(\d{2}):(\d{2})[\.:](\d{2,3})\]/g;
    const lines = lrcString.split('\n');

    for (const line of lines) {
      const matches = [...line.matchAll(lineRegex)];
      if (matches.length === 0) continue;

      const text = line.replace(lineRegex, '').trim();
      if (!text) continue;

      for (const match of matches) {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        let ms = parseInt(match[3], 10);
        if (ms < 100) ms *= 10; // normalize 2-digit centiseconds to milliseconds
        const time = min * 60 + sec + ms / 1000;
        this.lines.push({ time, text });
      }
    }

    // Sort by time
    this.lines.sort((a, b) => a.time - b.time);
    return this.lines;
  },

  /* Load lyrics from pre-fetched JSON in music/lyrics/ */
  async load(trackId) {
    // Try local pre-fetched lyrics first
    try {
      const resp = await fetch(`music/lyrics/${trackId}.json`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.lrc) {
          this.parse(data.lrc);
          return this.lines;
        }
      }
    } catch (e) {
      // No local lyrics, try LRCLIB API
    }

    // Try LRCLIB API
    const track = MusicPlayer.getTrack();
    if (!track) return [];

    try {
      const q = encodeURIComponent(`${track.title} ${track.artist}`);
      const resp = await fetch(`https://lrclib.net/api/search?q=${q}`);
      if (resp.ok) {
        const results = await resp.json();
        if (results.length > 0) {
          const synced = results.find(r => r.syncedLyrics) || results[0];
          const lrc = synced.syncedLyrics || synced.plainLyrics;
          if (lrc) {
            this.parse(lrc);
            return this.lines;
          }
        }
      }
    } catch (e) {
      console.warn('LRCLIB fetch failed:', e);
    }

    return [];
  },

  /* Get current line index for a given time */
  currentIndex(time) {
    if (!this.lines.length) return -1;
    for (let i = this.lines.length - 1; i >= 0; i--) {
      if (time >= this.lines[i].time) return i;
    }
    return -1;
  },

  /* Start rAF sync loop */
  startSync(renderFn) {
    this.stopSync();
    const loop = () => {
      const idx = this.currentIndex(MusicPlayer.currentTime);
      renderFn(idx);
      this.syncHandle = requestAnimationFrame(loop);
    };
    this.syncHandle = requestAnimationFrame(loop);
  },

  stopSync() {
    if (this.syncHandle) {
      cancelAnimationFrame(this.syncHandle);
      this.syncHandle = null;
    }
  },

  /* Render lyrics into an element with the given line renderer */
  renderLines(container, activeIdx, lineRenderer) {
    if (!this.lines.length) {
      container.innerHTML = '<div class="focus-lyric-line" style="color:rgba(255,255,255,0.5);text-align:center">暂无歌词</div>';
      return;
    }

    // Show a window around the active line
    const windowSize = 9;
    const half = Math.floor(windowSize / 2);
    let start = Math.max(0, activeIdx - half);
    let end = Math.min(this.lines.length, start + windowSize);
    if (end - start < windowSize) {
      start = Math.max(0, end - windowSize);
    }

    const visible = this.lines.slice(start, end);
    container.innerHTML = visible
      .map((l, i) => lineRenderer(l, start + i, activeIdx))
      .join('');
  }
};
