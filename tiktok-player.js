/* tiktok-player.js
 * Full-screen, TikTok-style vertical video player.
 *
 * Usage:
 *   showTikTokModal(videos, startIndex)
 *     videos: [{ video_url: "https://...mp4", title: "Optional caption" }, ...]
 *             (also accepts videoUrl / url instead of video_url)
 *   closeTikTokModal()
 *
 * Self-contained: injects its own CSS, no dependencies.
 */
(function () {
  'use strict';

  var STYLE_ID = 'tt-player-style';
  var ROOT_ID = 'ttPlayerRoot';
  var state = { observer: null, keyHandler: null, prevOverflow: '' };

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = '' +
      '#' + ROOT_ID + '{position:fixed;inset:0;z-index:100000;background:#000;display:flex;justify-content:center;font-family:"Plus Jakarta Sans",system-ui,sans-serif;animation:ttFade .25s ease;}' +
      '@keyframes ttFade{from{opacity:0}to{opacity:1}}' +
      '.tt-feed{width:100%;max-width:480px;height:100%;overflow-y:scroll;scroll-snap-type:y mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;overscroll-behavior:contain;}' +
      '.tt-feed::-webkit-scrollbar{display:none;}' +
      '.tt-slide{position:relative;width:100%;height:100%;scroll-snap-align:start;scroll-snap-stop:always;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden;}' +
      '.tt-slide video,.tt-slide iframe{width:100%;height:100%;object-fit:contain;background:#000;border:0;}' +
      '.tt-shade{position:absolute;left:0;right:0;bottom:0;height:200px;background:linear-gradient(to top,rgba(0,0,0,.75),transparent);pointer-events:none;}' +
      '.tt-caption{position:absolute;left:16px;right:80px;bottom:calc(28px + env(safe-area-inset-bottom,0px));color:#fff;pointer-events:none;}' +
      '.tt-title{font-size:15px;font-weight:800;line-height:1.35;text-shadow:0 1px 6px rgba(0,0,0,.6);}' +
      '.tt-count{font-size:12px;font-weight:600;opacity:.8;margin-top:4px;}' +
      '.tt-btn{position:fixed;width:42px;height:42px;border-radius:50%;border:none;background:rgba(255,255,255,.16);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:100002;transition:background .2s,transform .15s;}' +
      '.tt-btn:hover{background:rgba(255,255,255,.28);}' +
      '.tt-btn:active{transform:scale(.92);}' +
      '.tt-close{top:calc(16px + env(safe-area-inset-top,0px));right:16px;}' +
      '.tt-mute{top:calc(16px + env(safe-area-inset-top,0px));right:68px;}' +
      '.tt-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(.7);width:76px;height:76px;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;font-size:28px;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;}' +
      '.tt-slide.paused .tt-play{opacity:1;transform:translate(-50%,-50%) scale(1);}' +
      '.tt-spin{position:absolute;top:50%;left:50%;width:38px;height:38px;margin:-19px 0 0 -19px;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:ttSpin .8s linear infinite;pointer-events:none;opacity:0;transition:opacity .2s;}' +
      '.tt-slide.loading .tt-spin{opacity:1;}' +
      '@keyframes ttSpin{to{transform:rotate(360deg)}}' +
      '.tt-bar{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.2);}' +
      '.tt-bar i{display:block;height:100%;width:0;background:#fff;}' +
      '.tt-err{position:absolute;inset:0;display:none;align-items:center;justify-content:center;color:#cbd5e1;font-size:14px;font-weight:600;text-align:center;padding:24px;}' +
      '.tt-slide.error .tt-err{display:flex;}' +
      '.tt-hint{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);color:#fff;font-size:12px;font-weight:700;background:rgba(0,0,0,.5);padding:8px 14px;border-radius:20px;z-index:100002;animation:ttHint 3.2s ease forwards;pointer-events:none;}' +
      '@keyframes ttHint{0%{opacity:0}15%{opacity:1}75%{opacity:1}100%{opacity:0;visibility:hidden}}';
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function urlOf(v) { return (v && (v.video_url || v.videoUrl || v.url)) || ''; }

  function youtubeId(url) {
    var m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : null;
  }

  function closeTikTokModal() {
    var root = document.getElementById(ROOT_ID);
    if (state.observer) { state.observer.disconnect(); state.observer = null; }
    if (state.keyHandler) { document.removeEventListener('keydown', state.keyHandler); state.keyHandler = null; }
    if (root) {
      root.querySelectorAll('video').forEach(function (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { } });
      root.remove();
    }
    document.querySelectorAll('.tt-btn,.tt-hint').forEach(function (n) { n.remove(); });
    document.body.style.overflow = state.prevOverflow;
  }

  function showTikTokModal(videos, startIndex) {
    videos = (videos || []).filter(function (v) { return urlOf(v); });
    if (!videos.length) return;
    closeTikTokModal();
    injectStyle();

    var muted = false;
    state.prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    var root = document.createElement('div');
    root.id = ROOT_ID;
    var feed = document.createElement('div');
    feed.className = 'tt-feed';
    root.appendChild(feed);

    videos.forEach(function (v, i) {
      var url = urlOf(v);
      var yt = youtubeId(url);
      var slide = document.createElement('div');
      slide.className = 'tt-slide loading';
      slide.dataset.index = i;
      slide.dataset.src = url;
      if (yt) slide.dataset.yt = yt;
      slide.innerHTML =
        '<div class="tt-media"></div>' +
        '<div class="tt-shade"></div>' +
        '<div class="tt-play"><i class="fa-solid fa-play"></i></div>' +
        '<div class="tt-spin"></div>' +
        '<div class="tt-err">Could not play this video.</div>' +
        '<div class="tt-caption">' +
          (v.title ? '<div class="tt-title">' + esc(v.title) + '</div>' : '') +
          '<div class="tt-count">' + (i + 1) + ' / ' + videos.length + '</div>' +
        '</div>' +
        (yt ? '' : '<div class="tt-bar"><i></i></div>');
      feed.appendChild(slide);
    });

    document.body.appendChild(root);

    function mkBtn(cls, icon, label, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tt-btn ' + cls;
      b.setAttribute('aria-label', label);
      b.innerHTML = '<i class="fa-solid ' + icon + '"></i>';
      b.addEventListener('click', fn);
      document.body.appendChild(b);
      return b;
    }
    mkBtn('tt-close', 'fa-xmark', 'Close', closeTikTokModal);
    var muteBtn = mkBtn('tt-mute', 'fa-volume-high', 'Toggle sound', function () {
      muted = !muted;
      muteBtn.firstChild.className = 'fa-solid ' + (muted ? 'fa-volume-xmark' : 'fa-volume-high');
      root.querySelectorAll('video').forEach(function (v) { v.muted = muted; });
    });

    if (videos.length > 1) {
      var hint = document.createElement('div');
      hint.className = 'tt-hint';
      hint.textContent = 'Swipe up for next video';
      document.body.appendChild(hint);
    }

    // Build the media element lazily (current slide +/- 1)
    function ensureMedia(slide) {
      if (!slide || slide.dataset.ready) return;
      slide.dataset.ready = '1';
      var holder = slide.querySelector('.tt-media');
      holder.style.cssText = 'position:absolute;inset:0;';
      if (slide.dataset.yt) {
        holder.innerHTML = '<iframe src="https://www.youtube.com/embed/' + slide.dataset.yt +
          '?playsinline=1&rel=0&loop=1&playlist=' + slide.dataset.yt +
          '" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>';
        slide.classList.remove('loading');
        return;
      }
      var vid = document.createElement('video');
      vid.playsInline = true;
      vid.setAttribute('playsinline', '');
      vid.loop = true;
      vid.preload = 'auto';
      vid.muted = muted;
      vid.src = slide.dataset.src;
      vid.addEventListener('canplay', function () { slide.classList.remove('loading'); });
      vid.addEventListener('waiting', function () { slide.classList.add('loading'); });
      vid.addEventListener('playing', function () { slide.classList.remove('loading', 'paused'); });
      vid.addEventListener('error', function () { slide.classList.remove('loading'); slide.classList.add('error'); });
      vid.addEventListener('timeupdate', function () {
        var bar = slide.querySelector('.tt-bar i');
        if (bar && vid.duration) bar.style.width = (vid.currentTime / vid.duration * 100) + '%';
      });
      holder.appendChild(vid);
      slide.addEventListener('click', function () {
        if (vid.paused) { vid.play().catch(function () { }); } else { vid.pause(); slide.classList.add('paused'); }
      });
    }

    function playSlide(slide) {
      var vid = slide.querySelector('video');
      if (!vid) return;
      vid.muted = muted;
      var p = vid.play();
      if (p && p.catch) p.catch(function () {
        // Browser blocked sound autoplay - fall back to muted
        vid.muted = true;
        vid.play().catch(function () { slide.classList.add('paused'); });
      });
    }

    var slides = Array.prototype.slice.call(feed.children);
    state.observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var slide = en.target;
        var idx = +slide.dataset.index;
        if (en.isIntersecting && en.intersectionRatio >= 0.6) {
          [idx - 1, idx, idx + 1].forEach(function (n) { ensureMedia(slides[n]); });
          playSlide(slide);
        } else {
          var v = slide.querySelector('video');
          if (v) { v.pause(); if (en.intersectionRatio === 0) v.currentTime = 0; }
        }
      });
    }, { root: feed, threshold: [0, 0.6, 1] });
    slides.forEach(function (s) { state.observer.observe(s); });

    // Jump to the requested video
    var start = Math.min(Math.max(startIndex || 0, 0), slides.length - 1);
    ensureMedia(slides[start]);
    feed.scrollTop = start * feed.clientHeight;

    state.keyHandler = function (e) {
      if (e.key === 'Escape') closeTikTokModal();
      else if (e.key === 'ArrowDown') feed.scrollBy({ top: feed.clientHeight, behavior: 'smooth' });
      else if (e.key === 'ArrowUp') feed.scrollBy({ top: -feed.clientHeight, behavior: 'smooth' });
    };
    document.addEventListener('keydown', state.keyHandler);
  }

  window.showTikTokModal = showTikTokModal;
  window.closeTikTokModal = closeTikTokModal;
})();
