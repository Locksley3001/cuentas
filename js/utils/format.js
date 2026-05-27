import { APP_CONFIG } from '../config.js';

const numberFormatter = new Intl.NumberFormat(APP_CONFIG.currency.locale || 'es-CO', {
  minimumFractionDigits: 0,
  maximumFractionDigits: APP_CONFIG.currency.decimals ?? 0,
});

export function formatNumber(value) {
  return numberFormatter.format(Math.abs(toNumber(value)));
}

export function formatMoney(value, { signed = false, symbol = true } = {}) {
  const number = toNumber(value);
  const sign = signed && number < 0 ? '-' : '';
  const prefix = symbol ? APP_CONFIG.currency.symbol || '$' : '';
  return `${sign}${prefix}${formatNumber(number)}`;
}

export function formatSignedMoney(value, options = {}) {
  return formatMoney(value, { ...options, signed: true });
}

export function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? '')
    .replace(/[^\d,-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function bindMoneyInputs(root = document) {
  root.querySelectorAll('[data-money]').forEach(input => {
    if (input.dataset.moneyBound === 'true') return;
    input.dataset.moneyBound = 'true';
    input.inputMode = 'numeric';
    input.autocomplete = input.autocomplete || 'off';
    input.addEventListener('input', () => {
      const raw = parseMoney(input.value);
      input.value = raw ? formatNumber(raw) : '';
      input.dispatchEvent(new CustomEvent('money:changed', { bubbles: true, detail: { value: raw } }));
    });
  });
}

export function moneyValue(root, selector) {
  return parseMoney(root.querySelector(selector)?.value);
}

const Formatters = {
  formatNumber,
  formatMoney,
  formatSignedMoney,
  parseMoney,
  toNumber,
  bindMoneyInputs,
  moneyValue,
};

if (typeof window !== 'undefined') window.Formatters = Formatters;

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => bindMoneyInputs(document));
  const observer = new MutationObserver(() => bindMoneyInputs(document));
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export default Formatters;
