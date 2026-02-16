/**
 * Exchange Rate Auto-Update Service
 * Fetches exchange rates from API every 12 hours
 */

import { query, queryOne } from '../db';

const CURRENCY_NAMES: Record<string, string> = {
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  TRY: 'Turkish Lira',
  JPY: 'Japanese Yen',
  CNY: 'Chinese Yuan',
  CAD: 'Canadian Dollar',
  AUD: 'Australian Dollar',
  AED: 'UAE Dirham',
  SAR: 'Saudi Riyal',
  MXN: 'Mexican Peso',
  INR: 'Indian Rupee',
  BRL: 'Brazilian Real',
  PLN: 'Polish Zloty',
  SEK: 'Swedish Krona',
  SGD: 'Singapore Dollar',
  ZAR: 'South African Rand',
  EGP: 'Egyptian Pound',
  NZD: 'New Zealand Dollar',
  CHF: 'Swiss Franc',
  HKD: 'Hong Kong Dollar'
};

const CURRENCIES = Object.keys(CURRENCY_NAMES).filter(c => c !== 'USD');

export async function fetchAndUpdateExchangeRates(): Promise<{ success: boolean; updated: number; error?: string }> {
  try {
    console.log('[ExchangeRate] Fetching latest rates from API...');

    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json() as { rates: Record<string, number> };

    // USD is always 1
    await queryOne(`
      INSERT INTO exchange_rates (currency_code, currency_name, rate_to_usd, source, fetched_at)
      VALUES ('USD', 'US Dollar', 1, 'api', NOW())
      ON CONFLICT (currency_code) DO UPDATE SET
        rate_to_usd = 1,
        source = 'api',
        fetched_at = NOW(),
        updated_at = NOW()
    `);

    let updated = 1; // USD

    for (const code of CURRENCIES) {
      if (data.rates[code]) {
        const rateToUsd = 1 / data.rates[code];
        await queryOne(`
          INSERT INTO exchange_rates (currency_code, currency_name, rate_to_usd, source, fetched_at)
          VALUES ($1, $2, $3, 'api', NOW())
          ON CONFLICT (currency_code) DO UPDATE SET
            currency_name = COALESCE(EXCLUDED.currency_name, exchange_rates.currency_name),
            rate_to_usd = EXCLUDED.rate_to_usd,
            source = 'api',
            fetched_at = NOW(),
            updated_at = NOW()
        `, [code, CURRENCY_NAMES[code], rateToUsd]);
        updated++;
      }
    }

    console.log(`[ExchangeRate] Updated ${updated} exchange rates`);
    return { success: true, updated };

  } catch (error: any) {
    console.error('[ExchangeRate] Failed to update rates:', error.message);
    return { success: false, updated: 0, error: error.message };
  }
}

// 12 hours in milliseconds
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

let intervalId: NodeJS.Timeout | null = null;

export function startExchangeRateCron(): void {
  // Run immediately on startup
  console.log('[ExchangeRate] Starting auto-update service (every 12 hours)');
  fetchAndUpdateExchangeRates();

  // Then run every 12 hours
  intervalId = setInterval(() => {
    fetchAndUpdateExchangeRates();
  }, TWELVE_HOURS);
}

export function stopExchangeRateCron(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[ExchangeRate] Auto-update service stopped');
  }
}
