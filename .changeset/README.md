<!-- @format -->

# Changesets

Every change to mia.cx that visitors can see gets a changeset: run `pnpm changeset`, pick `@mia-cx/mia.cx`, and describe
the change in a sentence. Shared packages such as `@mia-cx/atmosphere` are not versioned; describe their effect on the
site under `@mia-cx/mia.cx`.

Merging to `main` deploys to [staging.mia.cx](https://staging.mia.cx) and opens or updates the release pull request.
Merging that pull request versions the site and deploys it to [mia.cx](https://mia.cx).
