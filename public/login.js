let pin = '';
const dots = [0, 1, 2, 3].map(i => document.getElementById('dot-' + i));
const errorEl = document.getElementById('error');

function updateDots() {
  dots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < pin.length);
    dot.classList.remove('error');
  });
}

function addDigit(d) {
  if (pin.length >= 4) return;
  pin += d;
  errorEl.textContent = '';
  updateDots();
  if (pin.length === 4) {
    submit();
  }
}

function removeDigit() {
  if (pin.length === 0) return;
  pin = pin.slice(0, -1);
  errorEl.textContent = '';
  updateDots();
}

async function submit() {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();

    if (!res.ok) {
      dots.forEach(d => d.classList.add('error'));
      errorEl.textContent = 'Invalid PIN';
      setTimeout(() => {
        pin = '';
        updateDots();
      }, 600);
      return;
    }

    // Redirect to intended page or role default
    const intended = new URLSearchParams(window.location.search).get('redirect');
    const routes = { order: '/order', kitchen: '/kitchen', admin: '/admin' };
    window.location.href = intended || routes[data.role] || '/';
  } catch (err) {
    errorEl.textContent = 'Connection error';
    pin = '';
    updateDots();
  }
}

// Keyboard support
document.addEventListener('keydown', (e) => {
  if (e.key >= '0' && e.key <= '9') addDigit(e.key);
  else if (e.key === 'Backspace') removeDigit();
});

// Check if already logged in — but not if we were sent here to re-auth
(async () => {
  const redirect = new URLSearchParams(window.location.search).get('redirect');
  if (redirect) {
    const backBtn = document.getElementById('back-btn');
    if (backBtn) backBtn.style.display = '';
    return;
  }
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const { role } = await res.json();
      const routes = { order: '/order', kitchen: '/kitchen', admin: '/admin' };
      window.location.href = routes[role] || '/';
    }
  } catch (e) {}
})();
