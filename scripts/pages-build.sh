#!/bin/sh
# Cloudflare Pages build for the mia-cx project.
#
# The project's dashboard command runs this file when it exists and falls back to `pnpm build`
# when it does not, because the production branch (`legacy`) is still the old single-app site,
# which builds to .svelte-kit/cloudflare with the dashboard defaults. The dashboard's output
# directory is therefore .svelte-kit/cloudflare for every branch, and this script copies the
# monorepo's static build there.
#
# Dashboard command: if [ -f scripts/pages-build.sh ]; then sh scripts/pages-build.sh; else pnpm build; fi
set -eu

# Every `pnpm`, including the ones package scripts call, must be the version package.json pins.
# Corepack's shims in a directory at the front of PATH make sure of that on any build machine.
shims="$(mktemp -d)"
corepack enable --install-directory "$shims" pnpm
PATH="$shims:$PATH"
export PATH
echo "pages-build: node $(node --version), pnpm $(pnpm --version)"

pnpm install --frozen-lockfile
pnpm --filter @mia-cx/mia.cx build

rm -rf .svelte-kit/cloudflare
mkdir -p .svelte-kit
cp -R apps/mia.cx/dist .svelte-kit/cloudflare
echo "pages-build: copied apps/mia.cx/dist to .svelte-kit/cloudflare"
