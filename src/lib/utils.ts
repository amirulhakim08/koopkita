import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Sanitise free-text search for PostgREST `or=` filters (prevents filter injection). */
export function searchTerm(q: string | undefined | null): string | null {
  const t = (q ?? "").replace(/[^\p{L}\p{N}@.\s_-]/gu, "").trim().slice(0, 60);
  return t.length ? t : null;
}
