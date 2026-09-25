import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** La utilidad de clases de motion-primitives (y de shadcn). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
