// Apply saved theme immediately to avoid flash
(function() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
})();

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  function update() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.textContent = isDark ? '\u2600\uFE0F' : '\uD83C\uDF19';
    btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  }

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    update();
  });

  update();
}

document.addEventListener('DOMContentLoaded', initThemeToggle);
