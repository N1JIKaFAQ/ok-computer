/* Player UI — mini player bar (extracted for clarity; core bindings in player-core.js) */
const PlayerUI = {
  init() {
    // Player bar DOM wiring lives in MusicPlayer.bindPlayerBar()
    // This module provides additional UI helpers

    // Progress bar hover effect
    const track = document.getElementById('player-bar-track');
    if (track) {
      track.addEventListener('mouseenter', () => track.classList.add('hover'));
      track.addEventListener('mouseleave', () => track.classList.remove('hover'));
    }
  },

  /* Update player bar cover art */
  setCover(svgOrHTML) {
    const cover = document.getElementById('player-bar-cover');
    if (cover) cover.innerHTML = svgOrHTML;
  },

  /* Update player bar track info */
  setInfo(title, artist) {
    const t = document.getElementById('player-bar-title');
    const a = document.getElementById('player-bar-artist');
    if (t) t.textContent = title;
    if (a) a.textContent = artist;
  }
};
