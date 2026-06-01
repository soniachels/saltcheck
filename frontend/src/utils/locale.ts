import * as Localization from 'expo-localization';

// Compact currency formatter that respects user locale
export function formatMoney(amount: number, currency: string = 'USD'): string {
  try {
    const locale = Localization.getLocales?.()[0]?.languageTag || 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function detectCurrency(): string {
  try {
    const locales = Localization.getLocales?.();
    if (locales && locales[0]?.currencyCode) {
      return locales[0].currencyCode;
    }
  } catch {}
  return 'USD';
}

export function detectRegion(): string {
  try {
    const locales = Localization.getLocales?.();
    if (locales && locales[0]?.regionCode) {
      return locales[0].regionCode;
    }
  } catch {}
  return 'US';
}
