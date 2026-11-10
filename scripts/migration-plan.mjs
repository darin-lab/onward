// @ts-check
/**
 * Migration bookkeeping shared by the two appliers — `scripts/migrate.mjs`
 * (deploy, `readdir`) and `src/lib/db.ts` (PGLite preview, `import.meta.glob`).
 *
 * Applied files are keyed by BASENAME, so the same file applies once no matter
 * which directory it is globbed from. That is what makes the auth schema safe to
 * copy from `migrations/auth/` into `migrations/` when an app turns sign-in on:
 * a database that already has `0001_auth.sql` will not re-run it.
 *
 * Neither applier descends into subdirectories, so `migrations/auth/*.sql` is
 * out of scope for both until it is copied up.
 */

/**
 * The `_migrations` key for a migration path (or bare filename).
 * @param {string} path
 * @returns {string}
 */
export function migrationName(path) {
  return path.split("/").pop() ?? path;
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isMigrationFile(path) {
  return path.endsWith(".sql");
}

/**
 * Whether this process is a Vercel PREVIEW deployment (a branch build), as
 * opposed to production, local dev, or anything else.
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function isPreviewEnv(env) {
  return env.VERCEL_ENV === "preview" || env.VERCEL_TARGET_ENV === "preview";
}

/**
 * The database URL this process may use, or undefined for "use PGLite".
 *
 * The project-wide DATABASE_URL is the LIVE database and Vercel sets it for
 * Preview as well as Production. A preview build must never use it (it would
 * run migrations against live data), so a preview reads PREVIEW_DATABASE_URL
 * only, which points at a separate Neon branch. Without that variable a
 * preview falls back to PGLite and cannot touch production data.
 * @param {Record<string, string | undefined>} env
 * @returns {string | undefined}
 */
export function databaseUrlFor(env) {
  const raw = isPreviewEnv(env) ? env.PREVIEW_DATABASE_URL : env.DATABASE_URL;
  return raw && raw.trim() ? raw.trim() : undefined;
}

/**
 * Migrations in `paths` that are not yet in `applied`, in apply order.
 * Non-`.sql` entries (a `readdir` also yields `migrations/auth/`) are dropped.
 * @param {Iterable<string>} paths
 * @param {Iterable<string>} applied
 * @returns {Array<{ name: string, path: string }>}
 */
export function pendingMigrations(paths, applied) {
  const done = new Set(applied);
  return [...paths]
    .filter(isMigrationFile)
    .map((path) => ({ name: migrationName(path), path }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(({ name }) => !done.has(name));
}
