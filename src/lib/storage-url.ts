/** Public URL of an object in the public "business-logos" bucket (logos only — never private files). */
export function logoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/business-logos/${path.split("/").map(encodeURIComponent).join("/")}`;
}
