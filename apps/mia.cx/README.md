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
- Merging the release pull request bumps the site's version, deploys it to [mia.cx](https://mia.cx) once staging is up, and tags the commit `mia.cx@v<version>`.
- To redeploy a release, run the Release workflow by hand with that release's merge commit.

CI deploys with the organisation's `CLOUDFLARE_ACCOUNT_ID` variable and `CLOUDFLARE_API_TOKEN` secret. To check the built Worker locally, run `npx wrangler dev` after a build.

The deployed entry is `worker.ts`, which wraps the Worker that `adapter-cloudflare` writes. The adapter reads `wrangler.sveltekit.jsonc` instead of `wrangler.jsonc`, because it overwrites whatever file `main` names.
