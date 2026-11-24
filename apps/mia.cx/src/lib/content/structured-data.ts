/**
 * The site's schema.org JSON-LD, built from the same sources as the pages (`site.ts`, the CV and the
 * vault) so it never drifts from them. Every page carries `person` and `website`; posts and projects
 * add their own node, which points back at Mia by `@id`.
 */
import portrait from '$lib/assets/portrait-800.webp';
import { cv } from '$lib/cv/content';
import { contact, otherSocials, primarySocials, site, summary } from './site';
import type { Post, WorkNote } from './vault';

const PERSON_ID = `${site.url}/#person`;
const WEBSITE_ID = `${site.url}/#website`;
const mia = { '@id': PERSON_ID };

/** Profiles that are Mia as a developer; the music profiles stay off, by her choice. */
const DEV_PROFILES = new Set(['linkedin', 'github', 'x', 'bluesky']);

/** "TypeScript, Cloudflare Workers (D1, R2)" → each skill, keeping commas inside parentheses. */
const SKILL_SEPARATOR = /,\s*(?![^(]*\))/;
/** The CV says "present" for a role that is ongoing. */
const ONGOING = /present$/;

export const person = {
    '@type': 'Person',
    '@id': PERSON_ID,
    name: site.name,
    jobTitle: site.role,
    description: summary,
    url: site.url,
    email: `mailto:${contact.email}`,
    image: new URL(portrait, site.url).href,
    address: { '@type': 'PostalAddress', addressCountry: 'NL' },
    worksFor: cv.experience
        .filter(({ dates }) => ONGOING.test(dates))
        .map(({ company }) => ({ '@type': 'Organization', name: company })),
    knowsAbout: cv.skills.flatMap(({ items }) => items.split(SKILL_SEPARATOR)),
    knowsLanguage: cv.languages.map(({ language }) => language),
    sameAs: [...primarySocials, ...otherSocials].filter(({ id }) => DEV_PROFILES.has(id)).map(({ href }) => href),
};

export const website = {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: site.url,
    name: site.domain,
    author: mia,
};

/** A post, on the blog or in a project folder. */
export const postData = (post: Post) => ({
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.summary,
    url: `${site.url}${post.href}`,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    author: mia,
    isPartOf: { '@id': WEBSITE_ID },
});

/** A project's page, linking to the product itself and its source where they exist. */
export const projectData = (note: WorkNote) => ({
    '@type': 'CreativeWork',
    name: note.title,
    description: note.summary,
    url: `${site.url}/work/${note.slug}`,
    sameAs: [note.live, note.source].filter(Boolean),
    keywords: note.stack,
    creator: mia,
});

/** One `<script type="application/ld+json">`, safe to inline: `<` can never close the tag early. */
export const jsonLd = (...nodes: object[]) =>
    `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replaceAll('<', '\\u003c')}</script>`;
