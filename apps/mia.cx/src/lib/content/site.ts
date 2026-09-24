/**
 * Identity, socials and navigation. Checked against primary sources on 2026-09-10: the GitHub API for
 * mia-riezebos, mia-cx and patchstep; ffm.bio/patch; and the Bluesky public API.
 */

export const site = {
    name: 'Mia Riezebos',
    /** Rendered as two right-aligned lines. */
    nameLines: ['Mia', 'Riezebos'],
    domain: 'mia.cx',
    role: 'Creative Developer',
    /** Stated by Mia on ffm.bio/patch. */
    pronouns: 'she/they/none',
    location: 'Netherlands',
    description: 'Mia Riezebos — creative developer. Freelance, Netherlands.',
};

/** TODO(mia): paste your server invite here and the Discord icon appears in the header row. */
/** Where the vault-to-site pipeline lives; the blog and project write-ups wait on it. */
export const SVARTZ_REPO = 'https://github.com/mia-cx/svartz';

export const DISCORD_INVITE = 'https://discord.gg/bePPwYJk2u';

import type { Social } from '@mia-cx/ui';

/** Featured in the hero and footer. */
export const primarySocials: Social[] = [
    { id: 'github', label: 'GitHub', href: 'https://github.com/mia-riezebos' },
    { id: 'x', label: 'X', href: 'https://x.com/patchstep' },
    { id: 'discord', label: 'Discord', href: DISCORD_INVITE },
];

/** Everything else, behind the +N button, in this order. */
export const otherSocials: Social[] = [
    { id: 'newgrounds', label: 'Newgrounds', href: 'https://patchstep.newgrounds.com' },
    { id: 'youtube', label: 'YouTube', href: 'https://www.youtube.com/channel/UChfFDsXEIpRapvbNB42Nl4A' },
    { id: 'bluesky', label: 'Bluesky', href: 'https://bsky.app/profile/patchstep.com' },
    { id: 'soundcloud', label: 'SoundCloud', href: 'https://soundcloud.com/patchstep' },
    { id: 'bandcamp', label: 'Bandcamp', href: 'https://music.patchstep.com' },
    { id: 'spotify', label: 'Spotify', href: 'https://open.spotify.com/artist/5QKpNE47kzOTNDAYyaAzOd' },
    { id: 'applemusic', label: 'Apple Music', href: 'https://music.apple.com/nl/artist/patch/1543434338' },
    { id: 'tidal', label: 'Tidal', href: 'https://tidal.com/artist/3577766' },
    { id: 'instagram', label: 'Instagram', href: 'https://instagram.com/patch.step' },
    { id: 'tiktok', label: 'TikTok', href: 'https://tiktok.com/@patchstep' },
    { id: 'linkedin', label: 'LinkedIn', href: 'https://linkedin.com/in/miariezebos' },
];

export const contact = {
    email: 'hello@mia.cx',
};

/**
 * Released as Patch. Titles, dates and links come from the SoundCloud catalogue
 * (soundcloud.com/patchstep) and the smart links in its track descriptions, checked 2026-09-10.
 * Where a release has its own smart link it is used; otherwise the track's SoundCloud page is.
 */

export const nav = [
    { label: 'Work', href: '/work' },
    { label: 'Blog', href: '/blog' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/#contact' },
];

/** Footer sitemap, mirroring the live mia.cx footer. */
export const sitemap = [
    { label: 'Home', href: '/' },
    { label: 'Work', href: '/work' },
    { label: 'Blog', href: '/blog' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/#contact' },
    { label: 'Music', href: 'https://ffm.bio/patch', external: true },
];

/** Mia's approved short introduction for the home page. */
export const about = [
    "I'm Mia Riezebos, a designer, creative developer and music producer. I like to understand how things work, from the big picture down to the details, and I love helping people figure out what their ideas need.",
];

/** The home hero reads as one sentence: "I'm" → name → `intro`, then a link to the full biography. */
export const intro =
    'a designer, creative developer and music producer. I like to understand how things work, from the big picture down to the details, and I love helping people figure out what their ideas need.';

/** Mia's approved full biography as inline Markdown, shown above contact links on /about. */
export const biography = [
    "I'm Mia, a designer, creative developer and music producer, and I love helping people figure out what they or their projects and ideas need.",
    'I care deeply about making things easier to understand and better to use. Complexity should be sparse, and should be given the space it needs to be understandable. That goes for complexity in any form.',
    "To me, communication is a very important aspect to simplify. That's why working with me is casual and collaborative. I’m easy to reach, explain my reasoning, and welcome honest disagreement. I want to understand you, your business, your mission and who you're doing it for.",
    "I have experience in deep technical aspects, but I've also handled the people side of projects. For a music collective, I've led multiple collaborative compilation releases, which required quality assurance, catalog management, distribution, artist relations, and revenue splits, all on crazy time crunches. All of that carries through into my work.",
    "I'm almost exclusively self-taught. I tried to study Music & Technology at HKU, but found that formal education is sub-optimal for me. I learn best with a project that *I* want to work on. If I have that, because of my ADHD, nothing can stop me.",
    "I’m particularly interested in accessibility and tools that make everyday life easier. Right now I'm working on Caelestis, a tool to make collaborative painting on Wplace easier, and more engaging. Like Figma or Google Docs for a pixel art MMORPG. I'm also working on Maal, a meal-planning app to make meal planning not just feasible, but possible for people with ADHD, like me.",
    'I’m especially useful for planning and ideation, when we can question assumptions and figure out the shape of the product you really need. I’m happy to talk about technical or creative direction over Discord, email, or in person. Your idea doesn’t need to be fully formed.',
];
