/* Album art resolver + SVG placeholder generator */
const AlbumArt = {
  /* Try to resolve cover art: track.coverFile → color-coded placeholder */
  getURL(track) {
    if (track.coverFile) return track.coverFile;
    return null;
  },

  /* Generate inline SVG placeholder — OK Computer style: white bg, big × */
  getSVG(track) {
    const hue = this.hashHue(track.title + track.artist);
    const bg = `hsl(${hue}, 8%, 94%)`;
    const fg = `hsl(${hue}, 4%, 55%)`;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
        <rect width="200" height="200" fill="${bg}"/>
        <text x="100" y="118" text-anchor="middle" font-family="Georgia,serif" font-size="100" font-weight="300" fill="${fg}">×</text>
      </svg>`;
    return svg;
  },

  /* Build an <img> tag with fallback to SVG data URI */
  getImg(track) {
    const url = this.getURL(track);
    const dataUri = 'data:image/svg+xml,' + encodeURIComponent(this.getSVG(track));
    return `<img src="${url || dataUri}" alt="${track.album || track.title}"
      onerror="this.onerror=null;this.src='${dataUri}'">`;
  },

  /* Deterministic hue from string */
  hashHue(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h) % 360;
  }
};
