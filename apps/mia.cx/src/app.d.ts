/// <reference types="unplugin-icons/types/svelte" />
// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
    namespace App {
        // interface Error {}
        // interface Locals {}
        interface PageData {
            /** Set by pages that print themselves; every other page prints the CV. */
            article?: boolean;
            /** Set by index pages: their items, printed after the CV. */
            appendix?: import('@mia-cx/print').Appendix;
            /** Set by /cv: the CV a role preset gives, which printing the page prints too. */
            cv?: import('$lib/cv/content').CV;
        }
        // interface PageState {}
        interface Platform {
            env: {
                /** Role presets for /cv, keyed by role: JSON `{ title, skills? }`. */
                CV_PRESETS?: { get(key: string): Promise<string | null> };
            };
        }
    }
}

export {};
