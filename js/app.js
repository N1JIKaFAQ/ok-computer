const App = {
  currentView: null,

  init() {
    this.route();
    window.addEventListener('hashchange', () => this.route());

    // Sidebar nav clicks
    document.querySelectorAll('.sidebar-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        location.hash = btn.dataset.view;
        this.closeMobileMenu();
      });
    });

    // Mobile menu
    const menuBtn = document.getElementById('mobile-menu-btn');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (menuBtn) {
      menuBtn.addEventListener('click', () => this.toggleMobileMenu());
    }
    if (backdrop) {
      backdrop.addEventListener('click', () => this.closeMobileMenu());
    }

    this.refreshStreak();

    // Init AI chat
    if (typeof AIChat !== 'undefined') {
      AIChat.init();
    }

    // Init MusicPlayer (will be available after Phase 2)
    if (typeof MusicPlayer !== 'undefined') {
      MusicPlayer.init();
    }
  },

  route() {
    const hash = location.hash.slice(1) || 'home';
    this.showView(hash);
  },

  showView(name) {
    // Update sidebar nav active state
    document.querySelectorAll('.sidebar-nav-btn').forEach(b => {
      const isActive = b.dataset.view === name;
      b.classList.toggle('active', isActive);
    });

    const container = document.getElementById('main-content');
    this.currentView = name;

    // Render view (each view is self-contained with its own header)
    switch (name) {
      case 'home':
        if (typeof PlayerHome !== 'undefined') {
          PlayerHome.render(container);
        } else {
          this.showFallbackHome(container);
        }
        break;
      case 'lesson':   LessonView.render(container); break;
      case 'fretboard': FretboardView.render(container); break;
      case 'chords':   ChordsView.render(container); break;
      case 'riffs':    RiffsView.render(container); break;
      case 'progressions': ProgressionView.render(container); break;
      case 'stats':    StatsView.render(container); break;
      case 'unlock':
        if (typeof UnlockView !== 'undefined') {
          UnlockView.render(container);
        }
        break;
      default:
        location.hash = 'home';
    }

    // Toggle decorations — only show on homepage
    if (typeof OKDecorations !== 'undefined') {
      if (name === 'home') {
        OKDecorations.show();
      } else {
        OKDecorations.hide();
      }
    }

    // Update AI chat context
    if (typeof AIChat !== 'undefined' && AIChat.updateContext) {
      AIChat.updateContext();
    }
  },

  showFallbackHome(container) {
    // Fallback home page until player-home.js is created
    container.innerHTML = `
      <div class="view active anim-slide-up">
        <div class="home-container">
          <div class="home-cover-wrap">
            <div class="home-cover-placeholder">
              <span class="ph-x">×</span>
              <span class="ph-text">OK COMPUTER</span>
            </div>
          </div>
          <div class="home-song-info">
            <h2 class="home-song-title">选择一首歌曲</h2>
            <p class="home-song-artist">从侧边栏播放列表开始播放</p>
          </div>
          <div class="home-controls">
            <button class="home-ctrl-btn" disabled>⏮</button>
            <button class="home-ctrl-btn home-ctrl-main" disabled>▶</button>
            <button class="home-ctrl-btn" disabled>⏭</button>
          </div>
          <p style="color:var(--text-muted);font-size:13px;margin-top:16px">
            音乐播放器即将上线…
          </p>
        </div>
      </div>
    `;
  },

  toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const isOpen = sidebar.classList.contains('open');
    if (isOpen) {
      this.closeMobileMenu();
    } else {
      sidebar.classList.add('open');
      backdrop.classList.add('show');
    }
  },

  closeMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    sidebar.classList.remove('open');
    backdrop.classList.remove('show');
  },

  refreshStreak() {
    const streak = Storage.getStreak();
    const el = document.getElementById('streak-count');
    if (el) el.textContent = streak;
  }
};

// Boot on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
