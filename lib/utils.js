import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Exchange rate USD to KZ - will be configurable via env
export const EXCHANGE_RATE_USD_TO_KZ = parseFloat(process.env.EXCHANGE_RATE_USD_TO_KZ) || 850;

// Format price in KZ from USD
export function formatPriceKz(priceUsd) {
  const priceKz = priceUsd * EXCHANGE_RATE_USD_TO_KZ;
  return new Intl.NumberFormat('pt-AO', {
    style: 'currency',
    currency: 'AOA',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(priceKz);
}

// Format date for Angola timezone
export function formatDate(date, options = {}) {
  return new Intl.DateTimeFormat('pt-AO', {
    timeZone: 'Africa/Luanda',
    ...options
  }).format(new Date(date));
}
