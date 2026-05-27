# @mia-cx/actions

A collection of GitHub Actions for mia-cx.

## Actions

- node-auto-publish
- node-prerelease

### node-auto-publish

A GitHub Action that automatically publishes to NPM when the version in `package.json` is updated.

Optionally:

- Create a tag
- Create a GitHub release
- Publish to GitHub Packages (change registry-url to `https://npm.pkg.github.com`)

#### Usage

```yaml
name: Publish to NPM

on:
  push:
    branches:
      - main

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: lts/iron
          registry-url: https://registry.npmjs.org/
          cache: pnpm

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: latest
          run_install: false

      - name: Get pnpm store directory
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

      - uses: actions/cache@v4
        name: Setup pnpm cache
        with:
          path: ${{ env.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        run: pnpm install

      - name: Publish to NPM
        uses: mia-cx/node-auto-publish@v1
        with:
          token: ${{ secrets.NPM_TOKEN }}
          tag: true
          release: true # requires `tag: true`
```
