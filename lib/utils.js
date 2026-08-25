import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Format date for Angola timezone
export function formatDate(date, options = {}) {
  return new Intl.DateTimeFormat('pt-AO', {
    timeZone: 'Africa/Luanda',
    ...options
  }).format(new Date(date));
}
