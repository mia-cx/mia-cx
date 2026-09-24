/** Every network an icon exists for, in `SocialIcon`. Sites choose which to show and in what order. */
export const SOCIAL_IDS = [
    'applemusic',
    'bandcamp',
    'bluesky',
    'discord',
    'github',
    'instagram',
    'linkedin',
    'newgrounds',
    'soundcloud',
    'spotify',
    'tidal',
    'tiktok',
    'x',
    'youtube',
] as const;

export type SocialId = (typeof SOCIAL_IDS)[number];

export interface Social {
    id: SocialId;
    label: string;
    /** Null while there is nothing to link to; components leave those out rather than show a dead control. */
    href: string | null;
}
