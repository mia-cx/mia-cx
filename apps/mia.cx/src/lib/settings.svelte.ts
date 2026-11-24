/**
 * The reader's settings, changed in the header's Settings popover. Each one lives in `localStorage`
 * under its own key. Theme, motion and the field also show on `<html>` as `data-theme`, `data-motion`
 * and `data-field`, which app.html sets from the same keys before first paint, so nothing flashes.
 */
import { browser } from '$app/environment';

function load(key: string) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function save(key: string, value: string | null) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        /* private mode; the choice just does not persist */
    }
}

/** A setting that is one of `options`, `fallback` until the reader picks another. */
function persisted<const T extends string | number | boolean>(
    key: string,
    options: readonly T[],
    fallback: T,
    apply?: (value: T) => void,
) {
    const stored = browser ? load(key) : null;
    let value = $state(options.find((option) => String(option) === stored) ?? fallback);
    return {
        get value() {
            return value;
        },
        set value(next: T) {
            value = next;
            save(key, String(next));
            apply?.(next);
        },
    };
}

/**
 * A setting the system answers until the reader picks the other option. Picking what the system
 * prefers drops the stored choice, so the site follows the system again.
 */
function followed<const T extends string>(
    key: string,
    query: string,
    [matches, otherwise]: readonly [T, T],
    apply: (value: T, chosen: boolean) => void,
) {
    const media = browser ? matchMedia(query) : undefined;
    let system = $state(media?.matches ? matches : otherwise);
    const stored = browser ? load(key) : null;
    let chosen = $state([matches, otherwise].find((option) => option === stored) ?? null);
    media?.addEventListener('change', () => {
        system = media.matches ? matches : otherwise;
        if (!chosen) apply(system, false);
    });
    return {
        get value() {
            return chosen ?? system;
        },
        set value(next: T) {
            chosen = next === system ? null : next;
            save(key, chosen);
            apply(next, chosen !== null);
        },
    };
}

const root = () => document.documentElement;

/** Double-click windows, in ms, by name. Medium misread 2 of 46 of Mia's own clicks. */
export const DOUBLE_CLICKS = { Fast: 250, Medium: 330, Slow: 410 } as const;
export const WIND_SPEEDS = [4, 8, 16, 32] as const;
export const SPEEDS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5] as const;

export const settings = {
    /** Light or dark. A choice also picks the browser chrome's `theme-color`. */
    theme: followed('theme', '(prefers-color-scheme: light)', ['light', 'dark'], (theme, chosen) => {
        if (chosen) root().dataset.theme = theme;
        else delete root().dataset.theme;
        // Each `theme-color` meta names its theme in `data-scheme`; no choice restores the media queries.
        for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][data-scheme]')) {
            const scheme = meta.dataset.scheme;
            meta.media = chosen ? (scheme === theme ? 'all' : 'not all') : `(prefers-color-scheme: ${scheme})`;
        }
    }),
    /** Reduce holds the field still, snaps the highlight, and seeks narration with a plain fade. */
    motion: followed('motion', '(prefers-reduced-motion: reduce)', ['reduce', 'full'], (motion) => {
        root().dataset.motion = motion;
    }),
    /** Off stops the field rendering, leaving the theme's paper colour. */
    field: persisted('field', [true, false], true, (on) => {
        if (on) delete root().dataset.field;
        else root().dataset.field = 'off';
    }),
    /** Selecting text pauses the narration; clearing the selection resumes it. */
    pauseWhileSelecting: persisted('pause-while-selecting', [true, false], true),
    /** How long after a first click a second one still makes a double-click, in ms. */
    doubleClick: persisted('double-click', Object.values(DOUBLE_CLICKS), DOUBLE_CLICKS.Medium),
    /** Seeking in the narration winds it like a tape instead of fading. */
    funny: persisted('funny', [true, false], false),
    /** The fastest a wind may play the tape, as a multiple of normal speed. */
    windSpeed: persisted('wind-speed', WIND_SPEEDS, 16),
    /** The narration's playback speed; the pitch stays put. */
    speed: persisted('speed', SPEEDS, 1),
};
