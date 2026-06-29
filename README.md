# Origin

Origin is a mobile-first file transfer app for moving original photos and videos between phones through Supabase Storage.

## Local setup

Your `.env` can use:

```env
SUPABASE_URL=...
SUPABASE_PUBLISHABLE=...
```

Do not put `SUPABASE_KEY` in client code or GitHub Pages secrets. The app only exposes the publishable anon key.

## Supabase setup

1. Create a public Storage bucket named `origin-transfers`.
2. Run `supabase.sql` in the Supabase SQL editor.

## Expiry behavior

The app marks files as downloaded after download starts. The SQL installs a scheduled cleanup job that runs every minute and deletes:

- files older than 15 minutes
- files already marked downloaded

This cleanup is handled inside Supabase using `pg_cron`, so it does not depend on a browser tab staying open.

## GitHub Pages deployment

GitHub Pages only serves static files. That means the frontend can only use values that are safe to ship to every visitor.

Use this rule:

- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE` are safe to expose in the client build.
- `SUPABASE_KEY` is not safe for the browser and should never be bundled into Pages.

Recommended deploy flow:

1. Push the app to GitHub.
2. Add repository secrets for the build step only:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE`
3. In your GitHub Actions build, write those secrets into `.env` before running the Vite build, or map them to `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE`.
4. Build the site and publish the `dist` folder to GitHub Pages.

Example GitHub Actions env mapping:

```yaml
env:
  VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  VITE_SUPABASE_PUBLISHABLE: ${{ secrets.SUPABASE_PUBLISHABLE }}
```

Important security note:

- GitHub Pages cannot safely access private secrets at runtime.
- Anything the browser needs must be public by design.
- For that reason, the app should use the Supabase anon/publishable key only, plus strict Supabase RLS and Storage policies.

If you ever need truly private server-side operations, add a backend step outside GitHub Pages, such as a Supabase Edge Function or a small serverless job. The upload/download UI itself can stay fully static on Pages.
