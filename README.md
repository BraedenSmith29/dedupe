# Dedupe: Tab Deduplicator

Dedupe is a Firefox browser extension that minimizes duplicate tabs, keeping you organized and saving some system resources. It works by scanning active tabs whenever you open a new one to check if you're navigating to a page you already have a tab for and, if it finds one, just switching to that tab instead.

## Getting Started

1. Clone the repository or download the code as a ZIP file and extract it.
2. Open a terminal and navigate to the project's root directory.
3. Run `npm install` to install the required dependencies.

## Development

- To compile the TypeScript files and build the extension, run `npm run build`. The compiled files and necessary assets will be placed in the `build` directory.
- Load the extension in Firefox:
  1. Go to `about:debugging#/runtime/this-firefox`.
  2. Click "Load Temporary Add-on…".
  3. Select the `manifest.json` file from the `build` directory.
- After making changes, run `npm run build` again and then select `Reload` on the Firefox debugging page.