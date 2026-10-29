/**
 * Mia's CV, in English. The single source for the printed CV and /cv. Every string is a whole
 * sentence or label, so Paraglide can take them over as messages without reassembling fragments.
 */
import { contact, site } from '$lib/content/site';

const LINKEDIN = 'linkedin.com/in/miariezebos';

/** A link as printed: the text a reader sees and where it goes. */
export interface Link {
    label: string;
    href: string;
}

/** A role on page 2, read by ATS parsers as Title · Company · dates. */
export interface Role {
    title: string;
    company: string;
    dates: string;
    description: string;
}

/** An entry on page 1's timeline. Months are `YYYY-MM`; an entry without an end is ongoing. */
export interface TimelineEntry {
    title: string;
    subtitle: string;
    start: string;
    end?: string;
}

export const cv = {
    name: site.name,
    title: 'Product Engineer & Founder',
    contact: [
        { label: contact.email, href: `mailto:${contact.email}` },
        { label: site.domain, href: site.url },
        { label: LINKEDIN, href: `https://${LINKEDIN}` },
    ] satisfies Link[],
    location: site.location,
    profile:
        "I'm a product engineer with roots in customer support. I like to understand how things work, from the big picture down to the details, and I love helping people figure out what they need. Through mia.cx I design, build and run my own products. In support, I learned to find the problem behind the question.",
    /** Page 1's visual summary of the experience below; page 2 carries the facts. */
    timeline: {
        work: [
            { title: 'VWO', subtitle: 'Dorenweerd College · Sep 2012 – Jul 2019', start: '2012-09', end: '2019-07' },
            {
                title: 'Grocery Clerk',
                subtitle: 'Albert Heijn · Sep 2016 – Mar 2020',
                start: '2016-09',
                end: '2020-03',
            },
            { title: 'Music & Technology', subtitle: 'HKU · Sep 2020 – Jul 2023', start: '2020-09', end: '2023-07' },
            { title: 'Call Agent', subtitle: 'GGD Coronalijn · Feb – Jul 2022', start: '2022-02', end: '2022-07' },
            {
                title: 'Customer Care Agent',
                subtitle: 'ABN AMRO · Nov 2023 – Jul 2025',
                start: '2023-11',
                end: '2025-07',
            },
            { title: 'Junior Support Consultant', subtitle: 'Humaris · Sep 2026 – present', start: '2026-09' },
        ],
        creative: [
            { title: 'Music', subtitle: 'Apr 2012', start: '2012-04' },
            { title: 'Sound engineering', subtitle: 'Nov 2016', start: '2016-11' },
            { title: 'Design & development', subtitle: 'May 2018', start: '2018-05' },
            { title: 'Founder, mia.cx', subtitle: 'Jul 2021', start: '2021-07' },
        ],
    } satisfies Record<'work' | 'creative', TimelineEntry[]>,
    skills: [
        { area: 'Product', items: 'Product discovery, UX and accessibility, technical specs' },
        {
            area: 'Engineering',
            items: 'TypeScript, Svelte/SvelteKit, Cloudflare Workers (D1, R2), WebGPU/WGSL, Swift/SwiftUI',
        },
        { area: 'Infrastructure', items: 'Docker, Kubernetes, GitOps' },
        { area: 'Support and data', items: 'TopDesk, Excel (Power Pivot), Power BI' },
        { area: 'Design', items: 'Affinity, Adobe Illustrator, Adobe After Effects' },
    ],
    languages: [
        { language: 'Dutch', level: 'Native' },
        { language: 'English', level: 'Fluent' },
    ],
    about: [
        "I care about making things easier to understand and better to use. Complexity should be rare, and where it's needed, it should get the space it needs to be understood.",
        "I've worked on both sides of a product: building it, and supporting the people who use it. Support taught me to keep asking until I find the real problem, and to leave people calm and heard, not just helped. Freelancing taught me to speak both languages, turning what a client needs into technical specs and explaining technical constraints back in plain words.",
        "I've also handled the people side of projects. For a music collective, I've led several collaborative compilation releases, covering quality assurance, catalogue management, distribution, artist relations and revenue splits, all on tight deadlines.",
        "I'm almost entirely self-taught. I studied Music & Technology at HKU and found that formal education doesn't suit me. I learn best through a project I want to build. Because of my ADHD, once I have one, nothing can stop me.",
    ],
    experience: [
        {
            title: 'Junior Support Consultant',
            company: 'Humaris',
            dates: 'Sep 2026 – present',
            description:
                "I help advisors, customers of ParaDIGMA Groep and their employees use ParaDIGMA's online absenteeism platform, working in TopDesk, Excel and the platform itself.",
        },
        {
            title: 'Founder',
            company: 'mia.cx',
            dates: 'Jul 2021 – present',
            description:
                'mia.cx is the umbrella for my products and my freelance design and development work. It started with logos, album covers and motion design for artists and start-ups, and grew into web design and development. In 2023 I launched the hypertrance.eu webshop for nuphory on Shopify and Cloudflare.',
        },
        {
            title: 'Customer Care Agent',
            company: 'ABN AMRO',
            dates: 'Nov 2023 – Jul 2025',
            description:
                "I helped clients with their banking every day: about half needed guidance in the mobile app, and the rest ranged from financial questions to complex disputes. After about four months I moved to International Clients, where I worked with clients in English and tracked the team's KPIs. When a slow Power BI dashboard was costing colleagues time, I raised it with my team lead and built a faster version in Excel with Power Pivot, documented so the team could keep using it after I left. I also submitted 44 improvement proposals in two months through an internal feedback channel, each with a problem analysis and a proposed solution.",
        },
        {
            title: 'Call Agent',
            company: 'Teleperformance, for GGD Coronalijn',
            dates: 'Feb 2022 – Jul 2022',
            description:
                'I booked COVID test appointments by phone during a period of high call volumes, often for stressed or worried callers, and handled their personal data with care.',
        },
        {
            title: 'Grocery Clerk',
            company: 'Albert Heijn Renkum',
            dates: 'Sep 2016 – Mar 2020',
            description:
                'I stocked shelves, received freight from the distribution centres before opening hours, and later worked in the bakery, helping customers on the shop floor along the way. I also earned a company emergency response (BHV) certificate.',
        },
    ] satisfies Role[],
    work: [
        {
            name: 'Caelestis',
            description: 'A template overlay and shared server for groups painting together on wplace.live.',
            link: { label: 'caelest.is', href: 'https://caelest.is' },
        },
        {
            name: 'Discord Wrapped',
            description: 'Turns a Discord data package into a report with shareable stories.',
            link: { label: 'discordwrapped.app', href: 'https://discordwrapped.app' },
        },
        {
            name: 'Vesta',
            description:
                'An all-in-one platform for independent musicians, small labels and creative publishers. In development.',
        },
        { name: 'Maal', description: 'Meal planning for people with ADHD.' },
        {
            name: 'Logitland',
            description:
                'A Discord server where only AI agents talk. People watch, and owners adopt agents for an XP bonus. In development.',
        },
    ] satisfies { name: string; description: string; link?: Link }[],
    education: [
        {
            title: 'Music & Technology',
            school: 'HKU University of the Arts Utrecht',
            dates: 'Sep 2020 – Jul 2023',
            note: 'Discontinued',
        },
        {
            title: 'VWO (pre-university secondary education)',
            school: 'Dorenweerd College',
            dates: 'Sep 2012 – Jul 2019',
        },
    ] satisfies { title: string; school: string; dates: string; note?: string }[],
};

export type CV = typeof cv;
