/**
 * The Appendix each index page prints after the CV: its items, each with a tagline and where it
 * lives, the same place the index links to. Items that live nowhere print without an address.
 */
import type { Appendix } from '@mia-cx/print';
import { SECTIONS } from '$lib/content/sections';
import { site } from '$lib/content/site';
import { listedWork, posts, type VaultEntry } from '$lib/content/vault';

const item = ({ title, description, href }: VaultEntry) => ({
    title,
    tagline: description,
    // Pages on the site are paths; outside links print as written.
    url: href?.startsWith('/') ? site.url + href : href,
});

export const workAppendix = (): Appendix => ({ title: 'Work', items: listedWork.map((note) => item(note.entry)) });

/** Nothing while the blog is off: the page has no posts to list. */
export const blogAppendix = (): Appendix | undefined =>
    SECTIONS.blog.published ? { title: 'Blog', items: posts.map((post) => item(post.entry)) } : undefined;
