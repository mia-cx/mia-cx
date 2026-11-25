/**
 * Funny mode's cassette deck: how a tape slows, speeds up and sounds while it moves at anything but
 * its normal speed. The narration player plays the tape through `tapeDeck`, at speeds from `stopping`
 * and `starting`.
 */

/** How sharply a tape stop and a tape start bend; 0 would be a straight line. */
const STOP_BEND = 3;
const START_BEND = 4;

/**
 * A stopping tape's speed, `k` of the way (0 to 1) through the stop. Drag grows with speed, so it
 * slows fastest at first and crawls to a halt, the pitch dropping off a cliff only at the end.
 */
export const stopping = (from: number, k: number) => (from * Math.expm1(STOP_BEND * (1 - k))) / Math.expm1(STOP_BEND);

/** A starting tape's speed: the motor pulls hardest while it is far from speed, then eases into it. */
export const starting = (from: number, to: number, k: number) =>
    from + ((to - from) * -Math.expm1(-START_BEND * k)) / -Math.expm1(-START_BEND);

// Each of these takes the tape's speed as a multiple of the reader's playback speed.

/** The treble a tape keeps: slow tape loses its top end, and a fast wind lifts off the head. */
const cutoff = (rate: number) => (rate <= 1 ? 300 + 11700 * rate ** 1.5 : 12000 / (1 + 0.12 * (rate - 1)));
/** The head's output follows the tape's speed, so a slowing tape fades as it falls in pitch. */
const level = (rate: number) => (rate <= 1 ? rate ** 0.7 : 1 / (1 + 0.04 * (rate - 1)));
/** How unevenly a winding tape touches the head; none at the reader's speed or below. */
const chatter = (rate: number) => Math.min(0.6, 0.05 * Math.max(0, rate - 1));
/** The friction hiss of a winding tape over the head; none at the reader's speed or below. */
const hiss = (rate: number) => Math.min(0.01, 0.001 * Math.max(0, rate - 1));
/** The motor's wobble in cents: steady at speed, unsteady while it fights to get there. */
const wobble = (rate: number) => 4 + 30 * Math.max(0, 1 - rate);

const FLUTTER_HZ = 5.5;
/** Chatter is the hiss's own noise slowed to this rate, so contact comes and goes irregularly. */
const CHATTER_HZ = 45;
/** How hard the head's amplifier drives into its soft limit. */
const DRIVE = 1.4;

const noises = new WeakMap<BaseAudioContext, AudioBuffer>();
/** A second of white noise, made once per context and looped. */
function noise(context: BaseAudioContext) {
    let buffer = noises.get(context);
    if (!buffer) {
        buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
        buffer.getChannelData(0).forEach((_, i, data) => (data[i] = Math.random() * 2 - 1));
        noises.set(context, buffer);
    }
    return buffer;
}

const saturation = Float32Array.from({ length: 1025 }, (_, i) => Math.tanh(DRIVE * (i / 512 - 1)) / Math.tanh(DRIVE));

/**
 * Plays `source` through a cassette deck: from `at`, while its speed runs through `rates` over
 * `seconds`, the deck's treble, level, chatter, hiss and flutter follow along, as heard against the
 * reader's `speed`, and hold their last values after. Returns the deck's output, for the caller to
 * connect, and `stop`, which stops `source` and the deck with it, now or at `when`.
 */
export function tapeDeck(
    context: BaseAudioContext,
    source: AudioBufferSourceNode,
    rates: Float32Array,
    seconds: number,
    at: number,
    speed: number,
) {
    const follow = (param: AudioParam, of: (rate: number) => number) =>
        param.setValueCurveAtTime(
            Float32Array.from(rates, (rate) => of(rate / speed)),
            at,
            seconds,
        );
    const running: AudioScheduledSourceNode[] = [source];
    const loop = () => {
        const node = context.createBufferSource();
        node.buffer = noise(context);
        node.loop = true;
        node.start(at);
        running.push(node);
        return node;
    };

    const treble = context.createBiquadFilter();
    follow(treble.frequency, cutoff);
    const head = context.createGain();
    follow(head.gain, level);
    const contact = context.createGain();
    const shaper = context.createWaveShaper();
    shaper.curve = saturation;
    source.connect(treble).connect(head).connect(contact).connect(shaper);

    // Chatter: slowed noise added to the contact's gain, which rests at 1.
    const slow = context.createBiquadFilter();
    slow.frequency.value = CHATTER_HZ;
    const depth = context.createGain();
    follow(depth.gain, (rate) => chatter(rate) * 12);
    loop().connect(slow).connect(depth).connect(contact.gain);

    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 5000;
    band.Q.value = 0.6;
    const friction = context.createGain();
    follow(friction.gain, hiss);
    loop().connect(band).connect(friction).connect(shaper);

    const flutter = context.createOscillator();
    flutter.frequency.value = FLUTTER_HZ;
    const cents = context.createGain();
    follow(cents.gain, wobble);
    flutter.connect(cents).connect(source.detune);
    flutter.start(at);
    running.push(flutter);

    return { output: shaper, stop: (when?: number) => running.forEach((node) => node.stop(when)) };
}
