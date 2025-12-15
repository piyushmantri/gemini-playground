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

1. Build the site with the correct base path for your repository:

   ```bash
   BASE_PATH=/gemini-playground/ npm run build
   ```

   Replace `gemini-playground` with your repository name if it differs.

2. Copy the build output into a `docs/` folder so GitHub Pages can serve it:

   ```bash
   rm -rf docs
   cp -R dist docs
   ```

3. Commit the `docs/` folder and push to `main`.
4. In GitHub → **Settings → Pages**, choose **main** as the branch and **/docs** for the folder. Your site will be available at `https://<username>.github.io/<repository-name>/` once the push completes.

## Features

- Gemini-like chat layout with sidebar, conversation header, and composer.
- Image generation using `models/gemini-3-pro-image-preview` with inline previews.
- Video generation targeting selectable Veo preview models (`veo-3.1-generate-preview`, `veo-3.1-generate-001`, `veo-3.0-generate-001`, `veo-2.0-generate-001`) with downloadable results.
- Optional reference image upload to guide Veo's output.
- Rich Markdown rendering for any textual context Gemini returns.
- Animated typing indicator while awaiting Gemini responses.
- API key manager with local persistence and quick link to fetch a new key.
- New chat button to clear the current conversation history.

## Notes

- Messages and the API key are kept locally in the browser. Refreshing the page clears the conversation history but retains the key until you remove it.
- The default image model is `models/gemini-3-pro-image-preview` and the default video model is `veo-3.1-generate-001`. Pick a different Veo preview model from the dropdown in the video composer to explore other releases.
- Image previews are returned as base64 data URLs. Use Google AI Studio if you need permanent hosting of generated assets.
- Video responses are streamed as blob URLs in the browser. Download the file or open the signed URI (with your API key appended) to access it again later.
- Veo currently supports 720p clips between 5-8 seconds. The UI enforces these limits.
  
