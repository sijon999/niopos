# Cloudflare Workers deployment

This app uses vinext for Cloudflare Workers. Keep the existing Next.js scripts for
Vercel and local development; use the vinext scripts for Cloudflare.

## Workers Builds

Connect this repository to a Cloudflare Worker and configure:

- Build command: `npm run build:vinext`
- Deploy command: `npx cf deploy --prebuilt`
- Preview command: `npx cf previews deploy --prebuilt`

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as build
variables in Cloudflare. They are required while building the app. Set
`SUPABASE_SERVICE_ROLE_KEY` as a runtime secret if the admin employee API is
used. Never use a service-role key in a `NEXT_PUBLIC_` variable or commit `.env`.

Deploy to the Worker’s `workers.dev` URL and verify the app before attaching a
production custom domain.

## Local commands

- `npm run dev:vinext` — start vinext development
- `npm run build:vinext` — build the Worker
- `npm run start:vinext` — preview the built Worker
- `npm run deploy:vinext` — build and deploy with the Cloudflare CLI
