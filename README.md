# Miiksa Beats (shared catalog on Netlify)

Beats are stored online (Netlify Blobs) through a small function in `netlify/functions/api.mjs`,
so every visitor on every device sees the same catalog.

## Folder layout
- public/            the website (index.html + assets/)
- netlify/functions/ the API (list beats, upload, delete, producer login)
- netlify.toml, package.json

## Deploy (GitHub + Netlify)
1. Create a GitHub repo and upload everything in this folder (not node_modules).
2. In Netlify: Add new site > Import an existing project > GitHub > pick the repo.
   Build command: leave empty. Publish directory: public (already set in netlify.toml). Deploy.
3. Site configuration > Environment variables > add  ADMIN_PIN  =  your private PIN.
4. Deploys > Trigger deploy > Deploy site (so the PIN is picked up).

A plain drag-and-drop of the folder does not install the function's dependency,
so use GitHub (above) or the Netlify CLI: `npm i -g netlify-cli && netlify deploy --prod`.

## Add beats
Click the page corners twice each, in order: top-left, top-right, bottom-right, bottom-left.
Enter your ADMIN_PIN, then upload. Beats appear for all visitors immediately.

## Limits
- Keep each audio file under about 20 MB (a tagged MP3 is usually 3-8 MB).
- Cover art is resized automatically.
