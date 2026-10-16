# Translation Groq Worker — deploy through GitHub

This folder is a standalone Cloudflare Worker project. It does not contain your Groq key. Never add the API key to GitHub.

## Deploy using Cloudflare's Git integration

1. Create a new GitHub repository named `translation-groq-worker`.
2. Upload the four files in this folder to the repository root: `worker.js`, `wrangler.jsonc`, `package.json`, and `README.md`.
3. In Cloudflare Dashboard, open **Workers & Pages** and choose **Create application** (wording may vary).
4. Choose the option to connect/import a Git repository. Connect GitHub and select `translation-groq-worker`.
5. Deploy the repository. Cloudflare Workers Builds uses `wrangler.jsonc`; the default deploy command is normally `npx wrangler deploy`. If asked to set it manually, leave the build command blank and use `npx wrangler deploy` as the deploy command.
6. After it finishes, open the newly created Worker from the Cloudflare dashboard. Under **Settings → Variables and Secrets** (or the equivalent settings section), add a secret named `GROQ_API_KEY` with your Groq key as the value. Save/redeploy.
7. Optional but recommended for a personal-only app: add a text variable named `ALLOWED_UID` whose value is your own Firebase Authentication UID. This prevents other signed-in Firebase users from using your AI proxy.
8. The deployed Worker URL will be shown in its dashboard, for example `https://translation-groq-proxy.<your-subdomain>.workers.dev`. This is the URL to put into `AI_PROXY_URL` in `index.html`; do not use a `workers.cloudflare.com/playground#...` URL.

## Check it

Opening the Worker URL directly in a browser should return JSON with `Method not allowed. Use POST.` and HTTP 405. That is expected because the Worker accepts POST requests from the app, not ordinary browser GET requests. If you instead see the Cloudflare Playground welcome page, the default Playground code is still deployed at that URL.
