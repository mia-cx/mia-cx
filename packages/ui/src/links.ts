/** Anything with a scheme leaves the site, including mailto:, so it gets the ↗ marker. */
export const isExternalHref = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href);
