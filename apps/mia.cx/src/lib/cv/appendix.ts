/**
 * The Appendix each index page prints after the CV: its items, each with a tagline and where it
 * lives. Items with their own page on mia.cx point there; the rest point at their live site or source.
 */
import type { Appendix } from '@mia-cx/print';
import { SECTIONS } from '$lib/content/sections';
import { site } from '$lib/content/site';
import { listedWork, posts } from '$lib/content/vault';

export const workAppendix = (): Appendix => ({
    title: 'Work',
    items: listedWork.map((item) => ({
        title: item.title,
        tagline: item.summary,
        url: item.markdown ? `${site.url}/work/${item.slug}` : (item.live ?? item.source ?? site.url),
    })),
});

/** Nothing while the blog is off: the page has no posts to list. */
export const blogAppendix = (): Appendix | undefined =>
    SECTIONS.blog.published
        ? {
              title: 'Blog',
              items: posts.map((post) => ({
                  title: post.title,
                  tagline: post.summary,
                  url: post.external ?? `${site.url}/blog/${post.slug}`,
              })),
          }
        : undefined;
