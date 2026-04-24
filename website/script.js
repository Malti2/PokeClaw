const root = document.documentElement;
const toggle = document.getElementById('themeToggle');
const toggleIcon = toggle?.querySelector('.theme-toggle-icon');
const toggleText = toggle?.querySelector('.theme-toggle-text');
const storageKey = 'pokeclaw-theme';

const systemTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
const savedTheme = localStorage.getItem(storageKey);
const initialTheme = savedTheme || systemTheme;

function applyTheme(theme) {
  root.setAttribute('data-theme', theme);
  localStorage.setItem(storageKey, theme);

  const isLight = theme === 'light';
  if (toggleIcon) toggleIcon.textContent = isLight ? '☀' : '☾';
  if (toggleText) toggleText.textContent = isLight ? 'Light' : 'Dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isLight ? '#f5f7fb' : '#0b1020');
}

applyTheme(initialTheme);

toggle?.addEventListener('click', () => {
  const nextTheme = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme);
});
