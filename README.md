<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/0d2fe81d-6008-4ba7-8a7c-6d49c75b37a8

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy

The production build uses relative asset paths, so the same `dist` output can run from both:

- GitHub Pages: `https://GDot-dot.github.io/search_map/`
- Cloudflare Pages: a root domain such as `https://your-project.pages.dev/`

### GitHub Pages

```bash
npm run deploy
```

### Cloudflare Pages

Use these settings:

- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: leave empty

`public/_redirects` is included so Cloudflare Pages can serve the app correctly on refresh or future client-side routes.
