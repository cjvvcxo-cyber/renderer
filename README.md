# CxO Project Renderer

A dedicated render-only GitHub Pages application.

## Workflow

1. Load `cxo-montage-project.json`.
2. Select the same local image folder containing the `(Custom)` JPG files.
3. Optionally upload the logo.
4. Confirm validation shows zero missing images.
5. Render the WebM master.
6. Download the WebM.
7. Convert the WebM to MP4 with FFmpeg WebAssembly.
8. Download the MP4.

All processing happens locally in the browser. Images and project data are not uploaded.

## Deploy to GitHub Pages

Upload `index.html`, `styles.css`, `app.js`, and `README.md` to a new repository. In **Settings > Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`.

## Important

Use current Microsoft Edge or Google Chrome. Keep the render tab active and prevent the computer from sleeping. A 120-second video renders in real time before MP4 conversion begins.
