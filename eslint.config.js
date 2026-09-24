/** @format */

import base from "@mia-cx/config/eslint";

export default [...base, { ignores: ["**/dist/", "**/.svelte-kit/", "apps/docs/", "packages/ui/"] }];
