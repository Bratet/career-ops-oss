/**
 * The .mjs engines resolve their own paths from __dirname (the repo root), so
 * the app must run with cwd = repo root for the two to agree.
 */
export const REPO_ROOT = process.cwd()

/** company name -> folder slug, matching the historical convention. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // drop parenthetical asides: "Xccelerated (part of Xebia)" -> "xccelerated"
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
