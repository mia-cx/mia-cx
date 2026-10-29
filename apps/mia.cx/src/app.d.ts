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
        }
        // interface PageState {}
        // interface Platform {}
    }
}

export {};
