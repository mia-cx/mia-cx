/**
 * The site's `<mia-marker>` timings in ms, where they differ from the marker's own: Mia's, tuned by
 * feel. The word's front edge leads the voice and its back edge eases out behind it. `MarkerTuning`
 * sets them on the marker, and its `?debug` panel starts from them.
 */
export const MARKER_TIMINGS = { trailing: 500, 'leading-delay': -450, 'trailing-delay': -150 };
