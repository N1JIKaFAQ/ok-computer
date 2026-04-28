/* OK Computer visual decorations — × watermarks, road lines, anime art */
const OKDecorations = {
  init() {
    this.addWatermarks();
    this.addRoadLines();
    this.addAnimeDecorations();
  },

  /* Scatter large × watermarks across the background */
  addWatermarks() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    const positions = [
      { top: '5%', right: '5%', size: 100, rotate: -15 },
      { bottom: '8%', left: '3%', size: 80, rotate: 10 },
      { top: '40%', right: '8%', size: 60, rotate: -5 },
      { bottom: '20%', right: '15%', size: 90, rotate: 8 }
    ];

    positions.forEach((pos, i) => {
      const el = document.createElement('div');
      el.className = 'x-watermark';
      el.textContent = '×';
      el.style.cssText = `
        top: ${pos.top || 'auto'};
        bottom: ${pos.bottom || 'auto'};
        left: ${pos.left || 'auto'};
        right: ${pos.right || 'auto'};
        font-size: ${pos.size}px;
        transform: rotate(${pos.rotate}deg);
        animation: fadeIn 1s ease-out ${i * 0.15}s both;
      `;
      document.body.appendChild(el);
    });
  },

  /* Road line decorations — dashes like highway markings */
  addRoadLines() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    // Top road line
    const top = document.createElement('div');
    top.className = 'road-line';
    top.style.cssText = `
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      opacity: 0.3;
    `;

    // Bottom road line
    const bottom = document.createElement('div');
    bottom.className = 'road-line';
    bottom.style.cssText = `
      bottom: 0;
      left: 0;
      right: 0;
      height: 2px;
      opacity: 0.5;
    `;

    mainContent.appendChild(top);
    mainContent.appendChild(bottom);
  },

  /* Anime character decorations — scattered images with low opacity */
  addAnimeDecorations() {
    // Available images from 图片/ directory that may be anime art
    const candidates = [
      '图片/微信图片_20260427223745_323_2353.jpg',
      '图片/微信图片_20260427223746_325_2353.jpg',
      '图片/微信图片_20260427223748_326_2353.png',
      '图片/微信图片_20260427223749_327_2353.jpg',
      '图片/微信图片_20260427223750_328_2353.jpg',
      '图片/微信图片_20260427223751_330_2353.jpg',
      '图片/微信图片_20260427223756_331_2353.jpg'
    ];

    // Pick 2-3 random positions for anime art
    const positions = [
      { bottom: '100px', right: '30px', width: 180, rotate: -8 },
      { top: '120px', right: '60px', width: 140, rotate: 5 },
      { bottom: '200px', left: '40px', width: 160, rotate: 12 }
    ];

    // Use 2 images from the pool
    const selected = candidates.sort(() => Math.random() - 0.5).slice(0, 3);

    selected.forEach((src, i) => {
      if (i >= positions.length) return;
      const pos = positions[i];

      const img = document.createElement('img');
      img.src = src;
      img.className = 'anime-decor';
      img.style.cssText = `
        position: fixed;
        bottom: ${pos.bottom || 'auto'};
        top: ${pos.top || 'auto'};
        right: ${pos.right || 'auto'};
        left: ${pos.left || 'auto'};
        width: ${pos.width}px;
        height: auto;
        transform: rotate(${pos.rotate}deg);
        opacity: 0.04;
        pointer-events: none;
        z-index: -1;
        border-radius: 12px;
        filter: grayscale(0.5);
        animation: fadeIn 1.5s ease-out ${i * 0.3}s both;
      `;

      img.onerror = () => {
        // Silently remove broken images
        img.remove();
      };

      document.body.appendChild(img);
    });
  },

  /* Refresh decorations (call after route changes if needed) */
  refresh() {
    // Remove existing decorations
    document.querySelectorAll('.x-watermark, .road-line, .anime-decor').forEach(el => el.remove());
    // Re-add
    this.addWatermarks();
    this.addRoadLines();
    this.addAnimeDecorations();
  }
};

// Auto-init decorations on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => OKDecorations.init());
} else {
  OKDecorations.init();
}
