/**
 * /cv.pdf: the CV as a dated PDF, printed from /cv by Cloudflare Browser Rendering. A render costs
 * browser time from a small daily allowance, so each one is cached for the day, per Theme, role and
 * preset value: editing a preset in KV shows in the next download.
 */

/** The day a PDF is dated by, in UTC: `YYYY-MM-DD`. */
export const pdfDate = (now: Date) => now.toISOString().slice(0, 10);

/** What the download saves as. */
export const pdfFilename = (date: string) => `MiaRiezebos_CV_${date}.pdf`;

/** A short, stable digest of a preset's raw value, so a KV edit makes a new cache entry. */
export async function digest(value: string) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(bytes).slice(0, 8)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The cache entry for one day's PDF of one Theme, role and preset value. */
export function cacheKey(
    origin: string,
    { date, theme, role, preset }: { date: string; theme: string; role: string | null; preset: string },
) {
    const query = new URLSearchParams({ date, theme, role: role ?? '', preset });
    return new Request(`${origin}/cv.pdf?${query}`);
}
