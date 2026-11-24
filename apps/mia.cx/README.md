# create-svelte

Everything you need to build a Svelte project, powered by [`create-svelte`](https://github.com/sveltejs/kit/tree/main/packages/create-svelte).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```bash
# create a new project in the current directory
npm create svelte@latest

# create a new project in my-app
npm create svelte@latest my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

## Deploying

The site runs as a Cloudflare Worker, configured in `wrangler.jsonc`. GitHub Actions deploys it with [Changesets](../../.changeset/README.md):

- Every push to `main` is checked, built and deployed to [staging.mia.cx](https://staging.mia.cx), the `staging` environment, which search engines are told not to index. It also opens or updates the release pull request.
- Merging the release pull request bumps the site's version, runs the same checks, deploys it to [mia.cx](https://mia.cx), and tags the commit `mia.cx@v<version>`.
- To redeploy a release, run the Release workflow by hand with that release's merge commit.

CI deploys with the organisation's `CLOUDFLARE_ACCOUNT_ID` variable and `CLOUDFLARE_API_TOKEN` secret. To check the built Worker locally, run `npx wrangler dev` after a build.

The deployed entry is `worker.ts`, which wraps the Worker that `adapter-cloudflare` writes. The adapter reads `wrangler.sveltekit.jsonc` instead of `wrangler.jsonc`, because it overwrites whatever file `main` names.

## Narration

Posts whose `narration` property is on are narrated in Mia's cloned ElevenLabs voice; the rest get no audio and cost nothing. Such a post's `<article data-narration>` marks what is read aloud: its title and body, minus code, controls and anything marked `data-narration-skip` (`src/lib/narration/extract.ts`). Each page's audio and word timings live in the `mia-cx-narration` R2 bucket under a hash of exactly that text, and `/narration/pages/<hash>.json|.mp3` serves them. Every environment shares the bucket, since a hash only ever names the audio for that text.

The Narration workflow runs on every push to `main`: it builds the site and runs `pnpm narrate`, which generates only blocks it hasn't generated before, stitches each page's audio, and stops without generating anything when a run would spend more than 25,000 characters or more than the account has left. Run the workflow by hand with a bigger budget to allow a larger run, such as after changing the voice.

Locally:

```bash
cp .env.example .env     # fill in the ElevenLabs key and voice ID
npx wrangler login       # R2 access, and the dev server's remote bucket
pnpm build && pnpm narrate --dry-run    # what it would narrate, and what that costs
pnpm narrate --only /blog/crunch-time   # narrate one page
pnpm dev                 # plays narration from the real bucket
```

Only `pnpm dev` binds the bucket remotely; builds and tests use an empty local one and need no login.
