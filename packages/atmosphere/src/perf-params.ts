/** URL parameters understood by ShaderCanvas for benchmarking and diagnostics. */

/** `?atmo-perf` turns on the window.__atmospherePerf measurement hook. */
export function atmoPerfEnabled(search: string) {
    return new URLSearchParams(search).has('atmo-perf');
}

/** `?atmo-scale=<n>` pins the adaptive resolution scale, clamped to the controller's range. */
export function parseAtmoScale(search: string) {
    const value = new URLSearchParams(search).get('atmo-scale');
    if (value === null) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0.125, parsed)) : undefined;
}
