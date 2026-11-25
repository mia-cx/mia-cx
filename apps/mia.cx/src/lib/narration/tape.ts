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

/** Points on each speed curve; the browser ramps straight between them. */
export const STEPS = 64;

/** A speed curve from `speedAt`, which maps 0 to 1 across a move to a rate. */
export const curve = (speedAt: (k: number) => number) =>
    Float32Array.from({ length: STEPS + 1 }, (_, k) => Math.max(0, speedAt(k / STEPS)));

/** How much tape `rates` over `seconds` move in the first `elapsed` seconds: the area under the ramps. */
export function travel(rates: Float32Array, seconds: number, elapsed = seconds) {
    const step = seconds / STEPS;
    let distance = 0;
    for (let k = 0; k < STEPS && k * step < elapsed; k++) {
        const part = Math.min(step, elapsed - k * step);
        const end = rates[k] + ((rates[k + 1] - rates[k]) * part) / step;
        distance += ((rates[k] + end) / 2) * part;
    }
    return distance;
}

/** How deep a wind's sag can go, as a power of `1 - sin`; deeper still barely shortens it. */
const DEEPEST_SAG = 64;

/**
 * A wind's speeds over `seconds`, from `from` to the reader's `speed`, covering `distance` of tape. A
 * long wind is the straight line between the two plus half a sine; a wind shorter than the line sags
 * in the middle instead. Either way it ends at the reader's speed, so the voice takes over in tune.
 * The sag has a limit: within a few hundredths of a second of tape, the wind travels a little further.
 */
export function winding(from: number, speed: number, distance: number, seconds: number) {
    const line = (k: number) => from + (speed - from) * k;
    const straight = ((from + speed) / 2) * seconds;
    if (distance >= straight) {
        const perBulge = (2 * seconds) / Math.PI;
        return curve((k) => line(k) + ((distance - straight) / perBulge) * Math.sin(Math.PI * k));
    }
    // The line times (1 - sin) to a power, which leaves its ends alone: deeper until it fits.
    const sagged = (power: number) => curve((k) => line(k) * (1 - Math.sin(Math.PI * k)) ** power);
    let [shallow, deep] = [0, DEEPEST_SAG];
    for (let halving = 0; halving < 30; halving++) {
        const power = (shallow + deep) / 2;
        if (travel(sagged(power), seconds) > distance) shallow = power;
        else deep = power;
    }
    return sagged(deep);
}

// Each of these takes the tape's speed as a multiple of the reader's playback speed.

/** The treble a tape keeps: slow tape loses its top end, and a fast wind lifts off the head. */
const cutoff = (rate: number) => (rate <= 1 ? 300 + 11700 * rate ** 1.5 : 12000 / (1 + 0.12 * (rate - 1)));
/** The head's output follows the tape's speed, so a slowing tape fades as it falls in pitch. */
const level = (rate: number) => (rate <= 1 ? rate ** 0.7 : 1 / (1 + 0.04 * (rate - 1)));
/** How unevenly a winding tape touches the head; none at the reader's speed or below. */
const chatter = (rate: number) => Math.min(0.6, 0.05 * Math.max(0, rate - 1));
/** The friction hiss of a winding tape over the head; none at the reader's speed or below. */
const hiss = (rate: number) => Math.min(0.005, 0.0005 * Math.max(0, rate - 1));
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
 * connect, and `stop`, which stops `source` and the deck with it, now or at `when`. The deck also
 * stops when `source` ends on its own.
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

    const stop = (when?: number) => running.forEach((node) => node.stop(when));
    // A tape that runs out of recording before its stop takes the deck with it.
    source.addEventListener('ended', () => stop());
    return { output: shaper, stop };
}

/** A grain of sound, and how far either side of its place it may shift to line up with the last, in seconds. */
const GRAIN = 0.04;
const SHIFT = 0.01;
/** Grains are lined up comparing every this many samples: plenty for a voice, a fraction of the work. */
const COARSE = 8;

/**
 * Speeds `channels` up by `factor`, keeping their pitch (WSOLA): half-overlapping grains, each taken
 * from where `factor` puts it, shifted up to `SHIFT` to where it best continues the last one, so the
 * waves meet in step. The narration player plays the tape from this at the reader's speed, so the tape
 * sounds like the voice and only its own changes of speed move the pitch.
 */
export function timeStretch(channels: Float32Array[], factor: number, sampleRate: number) {
    const size = Math.round(GRAIN * sampleRate) & ~1;
    const hop = size / 2;
    const shift = Math.round(SHIFT * sampleRate);
    const length = Math.ceil(channels[0].length / factor);
    // The first channel, with silence around it so a grain can reach past either end.
    const pad = shift + size;
    const guide = new Float32Array(channels[0].length + 2 * pad);
    guide.set(channels[0], pad);
    // Squared sine grains overlapping by half sum to exactly 1.
    const window = Float32Array.from({ length: size }, (_, i) => Math.sin((Math.PI * i) / size) ** 2);
    const out = channels.map(() => new Float32Array(length + size));
    let last = 0;
    for (let k = 0; k * hop < length; k++) {
        const target = Math.round(k * hop * factor);
        let from = target;
        // Of the grains near the target, the one most like what would seamlessly follow the last.
        let best = -Infinity;
        for (let d = -shift; k > 0 && d <= shift; d += COARSE) {
            let likeness = 0;
            for (let i = 0; i < size; i += COARSE)
                likeness += guide[pad + last + hop + i] * guide[pad + target + d + i];
            if (likeness > best) [best, from] = [likeness, target + d];
        }
        last = from;
        const [start, end] = [Math.max(0, -from), Math.min(size, channels[0].length - from)];
        channels.forEach((channel, c) => {
            for (let i = start; i < end; i++) out[c][k * hop + i] += channel[from + i] * window[i];
        });
    }
    return out.map((channel) => channel.subarray(0, length));
}
