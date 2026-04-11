// Shared price formatting — loaded by all views
let _formatter = null;

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const { locale, currency } = await res.json();
    _formatter = new Intl.NumberFormat(locale, { style: 'currency', currency });
  } catch (e) {
    _formatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  }
}

function formatPrice(value) {
  if (!_formatter) {
    // Fallback before config loads
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value));
  }
  return _formatter.format(Number(value));
}
