export { default as PrintSwitch } from './PrintSwitch.svelte';
export { default as QRCode } from './QRCode.svelte';

/** One entry in an index page's printed Appendix. */
export interface AppendixItem {
    title: string;
    tagline: string;
    /** Where the item lives; printed without its protocol, and encoded in the QR code. Neither prints without it. */
    url?: string;
}

/** What an index page prints after the CV: its name and its items. */
export interface Appendix {
    title: string;
    items: AppendixItem[];
}
