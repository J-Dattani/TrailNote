# TrailNote 🔖

TrailNote is a small, privacy-first Chrome extension (Manifest V3) designed to help you capture and organize quick page snapshots while you browse and research. It focuses on short, readable captures — headings, bullets, and short summaries — so you can build a compact trail of the pages you visited and quickly export a shareable PDF.

![TrailNote Icon](icons/icon-128.png)

## What is it? ✨

TrailNote captures a lightweight summary of pages you visit and stores up to five recent captures per session. It's targeted at researchers and information gatherers who want a fast way to collect page metadata (title, headings, bullets, author, date) and export a compact, readable PDF of their browsing trail.

> NOTE: This project is in a *premature* stage. It works for many pages but still needs refinements, better noise filtering across sites, richer export features (images, video links), and community testing.

## Key features (current)

- Capture page title, URL, time, short summary, headings, and bullets.
- Keep up to 5 recent captures in the current session.
- Simple popup UI to view session captures and export a cleaned PDF.
- Local-first processing — summarization and extraction are performed locally in the extension where possible, to respect privacy.
- Easy quick-add via context menu selection (right-click → add to Browsing/Research).

- PDF export: experimental and currently known to be unreliable. Please do not rely on PDF downloads yet — PDF output and the export experience are being actively improved. If you hit blank PDFs or formatting issues, please file an issue on GitHub and we will prioritize fixes.

## Roadmap / Planned improvements 🚀

- Better PDF exports with richer formatting and clickable links.
- Include images and video links in captures when present on the page.
- Smarter deduplication and per-site noise filtering.
- Improved summarization options (short vs. long) and export templates.
- Support for syncing or saving sessions externally (opt-in).

## Who is this for?

- Researchers scanning academic papers, blogs, and long-form web content.
- People who want a compact history of what they read without full browser history noise.
- Anyone who needs quick snapshots and simple shareable notes from web browsing sessions.

## Try it (development / local install)

1. Clone the repository to your machine.
2. Open Chrome and go to chrome://extensions.
3. Enable "Developer mode" (top-right).
4. Click "Load unpacked" and select this repository folder.
5. Open the extension popup and start a session.

## How it works — quick tour 🧭

Here are a few screenshots showing TrailNote in action. The images are stored in `docs/screenshots/`.

### Popup (compact)
![Popup compact](docs/screenshots/popup%20image.png)

*TrailNote popup UI — start/stop tracking, quick session controls, and the 'Use rich PDF' toggle.*

### Popup in-page (overlay)
![Popup in context](docs/screenshots/working%20image%20with%20summary.jpg)

*Popup showing captured summary and recent logs while browsing a page — useful to quickly review what was captured without leaving the tab.*

### Sessions view
![Sessions view](docs/screenshots/session%20stored%20image.png)

*List of saved sessions (past sessions) where you can download or delete a session.*

### Quick-add (context menu)
![Context menu quick-add](docs/screenshots/right%20click%20image.png)

*Select text on a page, right-click, and add the selection directly to Browsing or Research via the TrailNote context menu.*

## Privacy & data

TrailNote is designed to process data locally where possible. Captures are stored in Chrome's local extension storage and are not sent to any external server by default. If you contribute features that add remote sync, those will be opt-in and clearly documented.

## Contributing 🤝

This project is open-source — contributions, issues, and suggestions are welcome!

- Found a bug or have an idea? Open an issue on GitHub.
- Want to contribute code? Fork the repo, make changes, and open a pull request.
- Prefer to reach out? Leave a message on the repository or mention the issue number when opening PRs.

Please keep contributions friendly and include short descriptions of changes and the motivation.

## Reporting issues

If you encounter unexpected behavior (duplicate captures, blank PDF, noisy output, or pages that should be skipped), please open an issue with:

- A short description of the problem.
- The URL or site type where it happened (if shareable).
- Steps to reproduce, and any console logs if available.

## Attribution & icons

Icons are located in the `icons/` folder. You can customize or replace them; a 128x128 PNG is used for display in README and the extension store.

## License

This repository is currently open for contributions. If you want a specific license added (MIT, Apache-2.0, etc.), open an issue or add a PR and we can include it.

---

Thank you for trying TrailNote — a tiny companion for curious minds. If you want any edits to this README (tone, sections, or adding screenshots and badges), tell me and I'll update it.
"# TrailNote" 
