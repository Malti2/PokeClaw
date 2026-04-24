const root = document.documentElement;
const toggle = document.getElementById('themeToggle');
const label = toggle?.querySelector('.theme-toggle-label');
const dot = toggle?.querySelector('.theme-toggle-dot');
const key = 'pokeclaw-theme';

const systemTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
const saved = localStorage.getItem(key);

function setTheme(theme) {
  root.setAttribute('data-theme', theme);
  localStorage.setItem(key, theme);
  const light = theme === 'light';
  if (label) label.textContent = light ? 'Light' : 'Dark';
  if (dot) dot.style.opacity = light ? '0.6' : '0.75';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f7f7f2' : '#0b0d12');
}

setTheme(saved || systemTheme);

toggle?.addEventListener('click', () => {
  setTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
});
