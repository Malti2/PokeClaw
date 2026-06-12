const root = document.documentElement;
const toggle = document.getElementById('themeToggle');
const label = toggle?.querySelector('.theme-toggle-label');
const key = 'pokeclaw-theme';

const systemTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
const saved = localStorage.getItem(key);

function setTheme(theme) {
  root.setAttribute('data-theme', theme);
  localStorage.setItem(key, theme);
  if (label) label.textContent = theme === 'light' ? 'Light' : 'Dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f6f6f3' : '#0a0c10');
}

setTheme(saved || systemTheme);

toggle?.addEventListener('click', () => {
  setTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
});

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.14, rootMargin: '0px 0px -8% 0px' }
);

document.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el));
