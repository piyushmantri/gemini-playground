# Gemini Chat

A lightweight Gemini-inspired chat client built with React, TypeScript, and Vite. Provide your Google AI Studio API key, then describe what you want to see. The app calls the `models/gemini-3-pro-image-preview` model to generate image previews in a Gemini-style conversation layout.

## Prerequisites

- Node.js 18+
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open the printed URL (defaults to `http://localhost:5173`) in your browser.

4. When prompted, paste your Gemini API key. The key is stored only in your browser's local storage and never leaves the device.

5. Enter a descriptive prompt (e.g. "A futuristic cityscape at dusk, painted in watercolor") and press **Generate image** to receive an inline preview from Gemini.

6. Switch to the **Video generation** tab to describe motion (clips must be 5-8 seconds at 720p), optionally attach a reference image, and press **Generate video**. The app polls the Veo preview model until the video is ready, then streams it back inline.

## Available Scripts

- `npm run dev` - Start Vite in development mode with hot reloading.
- `npm run build` - Type-check the project and produce a production build in `dist/`.
- `npm run preview` - Preview the production build locally.

## Deploying to GitHub Pages

This project ships with a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds the site and publishes it to GitHub Pages whenever you push to the `main` branch.

1. Push the repository to GitHub and ensure the default branch is named `main` (adjust the workflow trigger if you prefer a different branch).
2. In your repository settings, enable GitHub Pages and choose **GitHub Actions** as the source. The next push to `main` will build and deploy automatically.
3. The workflow sets `BASE_PATH` to `/<repository-name>/` during the build so the Vite `base` matches the Pages subdirectory. If you later serve the site from a custom domain, update or remove the `BASE_PATH` environment variable in the workflow accordingly.
4. Once the workflow succeeds, your site will be available at `https://<username>.github.io/<repository-name>/` (or your configured custom domain).

## Features

- Gemini-like chat layout with sidebar, conversation header, and composer.
- Image generation using `models/gemini-3-pro-image-preview` with inline previews.
- Video generation targeting the Veo preview model (`veo-2.0-generate-001`) with downloadable results.
- Optional reference image upload to guide Veo's output.
- Rich Markdown rendering for any textual context Gemini returns.
- Animated typing indicator while awaiting Gemini responses.
- API key manager with local persistence and quick link to fetch a new key.
- New chat button to clear the current conversation history.

## Notes

- Messages and the API key are kept locally in the browser. Refreshing the page clears the conversation history but retains the key until you remove it.
- The default image model is `models/gemini-3-pro-image-preview` and the default video model is `veo-2.0-generate-001`. Adjust the constants in `src/App.tsx` to explore other releases.
- Image previews are returned as base64 data URLs. Use Google AI Studio if you need permanent hosting of generated assets.
- Video responses are streamed as blob URLs in the browser. Download the file or open the signed URI (with your API key appended) to access it again later.
- Veo currently supports 720p clips between 5-8 seconds. The UI enforces these limits.
  
