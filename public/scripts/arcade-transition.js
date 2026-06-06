/**
 * 進入遊戲室的過渡效果：點擊任何 href="/games" 的連結時，
 * 先播放霓虹 warp 掃描線全螢幕動畫，再導航。
 * 尊重 prefers-reduced-motion；保留 Ctrl/Cmd/中鍵另開分頁行為。
 */
(function () {
  'use strict';

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  document.addEventListener(
    'click',
    function (e) {
      // 允許另開分頁 / 非左鍵
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      var target = e.target;
      var link = target && target.closest ? target.closest('a[href="/games"]') : null;
      if (!link) return;
      if (prefersReducedMotion()) return; // 直接走預設導航

      e.preventDefault();

      var overlay = document.createElement('div');
      overlay.className = 'arcade-warp';
      var label = document.createElement('span');
      label.className = 'arcade-warp-text';
      label.textContent = 'ENTERING DUNGEON ARCADE';
      overlay.appendChild(label);
      document.body.appendChild(overlay);

      window.setTimeout(function () {
        window.location.href = '/games';
      }, 620);
    },
    true, // capture：先於其他處理器
  );
})();
