<!--
    Plays a post's narration, highlighting the word being spoken with the page's `<mia-marker>`;
    clicking a word while it plays seeks there, and with the button focused the arrow keys skip between
    paragraphs. The moving highlight is the progress, so the control is one icon button: headphones
    before it starts, then pause or play. A second button beside it cycles the playback speed. The
    reader's settings (`$lib/settings`) can pause it while text is selected, and funny mode makes it a
    cassette: seeks wind the tape, pauses and plays stop and start it. It finds the audio by a hash of
    exactly what the page reads (`$lib/narration/extract`), so it appears only once that text has been
    narrated.
-->
<script lang="ts">
    import { onMount } from 'svelte';
    import Headphones from '~icons/lucide/headphones';
    import Pause from '~icons/lucide/pause';
    import Play from '~icons/lucide/play';
    import { narratedBlocks, pageKey, type NarratedWord, type NarrationManifest } from '$lib/narration/extract';
    import { SPEEDS, settings } from '$lib/settings.svelte';

    /** Seeks land this long before the word, since the timings can run a little late. */
    const PRE_ROLL = 0.3;
    const FADE_IN = 0.25;
    const FADE_OUT = 0.12;
    /** Funny mode's tape moves: every wind takes `WIND`, however far it goes; a stop and a start are quicker. */
    const WIND = 1.2;
    const STOP = 0.6;
    const START = 0.4;
    /** Even a short wind bulges this far past the reader's speed, so it is heard as one. */
    const MIN_BULGE = 1;
    /** The voice hands over to and from the tape this quickly: fast, but without a click. */
    const CUT = 0.03;
    /** Points on each speed curve; the browser ramps straight between them. */
    const STEPS = 64;
    /** Tape a spin carries past its end, in seconds, to cover the audio starting up again. */
    const TAIL = 1;
    /**
     * At the handover the audio may trail the tape: by more than `IN_STEP` seconds, it seeks ahead to
     * catch up, up to `CATCH_UPS` times.
     */
    const IN_STEP = 0.02;
    const CATCH_UPS = 3;

    let src = $state<string>();
    let audio = $state<HTMLAudioElement>();
    let time = $state(0);
    let paused = $state(true);
    /** Whether the reader asked for playback; it leads `paused` through the fade out before a pause. */
    let playing = $state(false);
    const started = $derived(time > 0 || !paused);

    let marker = $state<HTMLElementTagNameMap['mia-marker']>();
    /** The narrated words, in reading order, and when each starts, in seconds. */
    let spoken: NarratedWord[] = [];
    let starts: number[] = [];
    /** The narrated word each block (a paragraph, heading or list item) starts at, for skipping by keyboard. */
    let blockStarts: number[] = [];

    /**
     * A narrated word's index among the marker's words, looked up when it is needed: text elsewhere in
     * the marker, such as a "Copied" tip appearing, shifts the marker's numbering.
     */
    const markerWord = (host: HTMLElementTagNameMap['mia-marker'], i: number) =>
        host.wordIndexOf(spoken[i].node, spoken[i].start);

    /** The narrated word at a marker word, or -1; found by halving, since both run in reading order. */
    function narratedAt(host: HTMLElementTagNameMap['mia-marker'], word: number) {
        let [low, high] = [0, spoken.length];
        while (low < high) {
            const mid = (low + high) >> 1;
            if (markerWord(host, mid) < word) low = mid + 1;
            else high = mid;
        }
        return low < spoken.length && markerWord(host, low) === word ? low : -1;
    }
    /** A sought word the highlight stays on through the pre-roll, until it is spoken. */
    let held: { word: number; landed: boolean } | undefined;

    // Fades go through a gain node: iOS ignores `audio.volume`. Made on the first play, a user gesture.
    let context: AudioContext | undefined;
    let gain: GainNode | undefined;
    let pending: ReturnType<typeof setTimeout> | undefined;
    /** How long sound takes from the context's clock to the ear, in seconds: large over Bluetooth. */
    const latency = () => (context ? context.baseLatency + (context.outputLatency || 0) : 0);

    function fade(to: number, seconds: number) {
        if (!gain) return;
        const now = gain.context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(to, now + seconds);
    }

    /** Plays with a fade in, or in funny mode as a tape start: from still up to the reader's speed. */
    async function play() {
        if (!audio) return;
        playing = true;
        pausedBySelection = false;
        clearTimeout(pending);
        if (!context || !gain) {
            context = new AudioContext();
            gain = context.createGain();
            context.createMediaElementSource(audio).connect(gain).connect(context.destination);
        }
        if (spin || taped()) {
            await context.resume();
            const { at, rate, direction } = tapeNow();
            const from = direction > 0 ? rate : 0;
            const speed = settings.speed.value;
            return turn(
                at,
                1,
                curve((k) => from + (speed - from) * Math.sin((Math.PI / 2) * k)),
                START,
                true,
            );
        }
        gain.gain.value = 0;
        try {
            await context.resume();
            await audio.play();
        } catch (error) {
            // Audio that won't load or start leaves nothing playing: show Play again, and still report it.
            playing = false;
            throw error;
        }
        fade(1, FADE_IN);
    }

    /** Pauses with a fade out, or in funny mode as a tape stop: the speed and pitch slide down to still. */
    function pause() {
        playing = false;
        pausedBySelection = false;
        clearTimeout(pending);
        if (spin || taped()) {
            // A wind cut short never reaches its word, so the highlight follows the tape instead.
            held = undefined;
            const { at, rate, direction } = tapeNow();
            return turn(
                at,
                direction,
                curve((k) => rate * Math.cos((Math.PI / 2) * k)),
                STOP,
                false,
            );
        }
        fade(0, FADE_OUT);
        pending = setTimeout(() => audio?.pause(), FADE_OUT * 1000);
    }

    /** Whether selecting text paused the narration, so clearing the selection resumes it. */
    let pausedBySelection = false;
    function followSelection() {
        const selected = getSelection()?.isCollapsed === false;
        if (selected && playing && settings.pauseWhileSelecting.value) {
            pause();
            pausedBySelection = true;
        } else if (!selected && pausedBySelection) void play();
    }

    /**
     * Funny mode's tape: the narration decoded, since an audio element can't play backwards or let its
     * pitch follow its speed. Loaded as soon as funny mode can use it, so the first play already
     * starts like a tape; until it is ready, playing, pausing and seeking fade as usual. A failed load
     * is reported and tried again when funny mode is next switched on.
     */
    let tape = $state<AudioBuffer>();
    $effect(() => {
        if (!settings.funny.value || settings.motion.value === 'reduce' || !src || tape) return;
        const load = new AbortController();
        fetch(src, { signal: load.signal })
            .then((response) => {
                if (!response.ok) throw new Error(`Narration audio: ${response.status}`);
                return response.arrayBuffer();
            })
            // Any context decodes; a source in the live one resamples the buffer if their rates differ.
            .then((data) =>
                load.signal.aborted
                    ? undefined
                    : new OfflineAudioContext({ length: 1, sampleRate: 48000 }).decodeAudioData(data),
            )
            .then((buffer) => void (load.signal.aborted || (tape = buffer)))
            .catch((error) => load.signal.aborted || console.error('Funny mode could not load the tape', error));
        return () => load.abort();
    });
    const taped = () => tape !== undefined && settings.funny.value && settings.motion.value === 'full';

    /**
     * The tape moving now: where it starts and ends, which way, and its speed over time, as `STEPS + 1`
     * evenly spaced rates the browser ramps between.
     */
    let spin:
        | {
              source: AudioBufferSourceNode;
              from: number;
              to: number;
              /** Where the tail runs out: past it the tape is silent and goes no further. */
              end: number;
              direction: number;
              rates: Float32Array;
              seconds: number;
              begun: number;
          }
        | undefined;

    /** A speed curve from `speedAt`, which maps 0 to 1 across the move to a rate. */
    const curve = (speedAt: (k: number) => number) =>
        Float32Array.from({ length: STEPS + 1 }, (_, k) => Math.max(0, speedAt(k / STEPS)));

    /** How much tape `rates` over `seconds` move in the first `elapsed` seconds: the area under the ramps. */
    function travel(rates: Float32Array, seconds: number, elapsed = seconds) {
        const step = seconds / STEPS;
        let distance = 0;
        for (let k = 0; k < STEPS && k * step < elapsed; k++) {
            const part = Math.min(step, elapsed - k * step);
            const end = rates[k] + ((rates[k + 1] - rates[k]) * part) / step;
            distance += ((rates[k] + end) / 2) * part;
        }
        return distance;
    }

    /**
     * Where the tape is, how fast it moves and which way: `of` spin's (by default the one playing), or
     * with none, the audio's. A spin is placed where it is now, or if `heard`, where the reader hears it.
     */
    function tapeNow(heard = false, of = spin) {
        if (!of) return { at: audio!.currentTime, rate: audio!.paused ? 0 : settings.speed.value, direction: 1 };
        const elapsed = Math.max(0, context!.currentTime - (heard ? latency() : 0) - of.begun);
        // Past its curve, a spin's tail runs on forward from where it ended, at its last rate.
        if (elapsed >= of.seconds) {
            const rate = of.rates[STEPS];
            return { at: Math.min(of.end, of.to + rate * (elapsed - of.seconds)), rate, direction: 1 };
        }
        const k = Math.min(STEPS - 1, Math.floor((elapsed / of.seconds) * STEPS));
        const into = (elapsed / of.seconds) * STEPS - k;
        return {
            at: of.from + of.direction * travel(of.rates, of.seconds, elapsed),
            rate: of.rates[k] + (of.rates[k + 1] - of.rates[k]) * into,
            direction: of.direction,
        };
    }

    /**
     * The spin the highlight follows: the one playing, or a tape stop until its end has been heard.
     * Where it is heard is updated every frame in `tapeAt`, unset when no spin is followed.
     */
    let followed: typeof spin;
    let tapeAt = $state<number>();
    let frame = 0;
    function follow() {
        if (followed && followed !== spin && context!.currentTime - latency() >= followed.begun + followed.seconds)
            followed = undefined;
        tapeAt = followed && tapeNow(true, followed).at;
        frame = followed ? requestAnimationFrame(follow) : 0;
    }

    /** The moment a spin reaches its end and the audio takes over again. */
    let landing: ReturnType<typeof setTimeout> | undefined;

    function stopSpin() {
        clearTimeout(landing);
        followed = undefined;
        if (!spin) return;
        spin.source.onended = null;
        spin.source.stop();
        spin = undefined;
        clearTimeout(pending);
        audio?.pause();
    }

    /**
     * Moves the tape like a cassette: plays it from `from`, forward or reversed (`direction` 1 or -1),
     * at `rates` spread over `seconds`, the pitch following the speed. The voice hands over to the
     * tape, and the audio waits silent where the tape will stop. Then, if `resume`, `landed` runs and
     * the audio plays on from there.
     */
    function turn(
        from: number,
        direction: number,
        rates: Float32Array,
        seconds: number,
        resume: boolean,
        landed?: () => void,
    ) {
        stopSpin();
        clearTimeout(pending);
        const decoder = context!;
        const reel = tape!;
        const onReel = (t: number) => Math.min(reel.duration, Math.max(0, t));
        from = onReel(from);
        const to = onReel(from + direction * travel(rates, seconds));
        // The stretch the spin crosses, reversed when winding back, then, if the audio resumes after,
        // `TAIL` of tape onward from `to` to play at the last rate until the audio is heard again.
        const sample = (t: number) => Math.round(t * reel.sampleRate);
        const [first, last] = [sample(Math.min(from, to)), sample(Math.max(from, to))];
        const tail = resume ? sample(onReel(to + TAIL)) - sample(to) : 0;
        const stretch = decoder.createBuffer(reel.numberOfChannels, Math.max(1, last - first + tail), reel.sampleRate);
        for (let channel = 0; channel < reel.numberOfChannels; channel++) {
            const data = reel.getChannelData(channel);
            const crossed = data.slice(first, last);
            if (direction < 0) crossed.reverse();
            stretch.copyToChannel(crossed, channel);
            stretch.copyToChannel(data.subarray(sample(to), sample(to) + tail), channel, last - first);
        }
        const source = decoder.createBufferSource();
        source.buffer = stretch;
        const out = decoder.createGain();
        source.connect(out).connect(decoder.destination);
        const now = decoder.currentTime;
        source.playbackRate.setValueCurveAtTime(rates, now, seconds);
        source.start(now);
        const end = to + tail / reel.sampleRate;
        const current = { source, from, to, end, direction, rates, seconds, begun: now };
        spin = followed = current;
        cancelAnimationFrame(frame);
        follow();
        if (!resume) {
            source.stop(now + seconds);
            source.onended = () => (spin = undefined);
        } else {
            landing = setTimeout(async () => {
                landed?.();
                const voice = audio!;
                try {
                    await voice.play();
                } catch (error) {
                    // Audio that won't start leaves nothing playing: stop the tape, show Play, report it.
                    if (spin === current) {
                        stopSpin();
                        playing = false;
                    }
                    throw error;
                }
                // The tape ran on while the audio started from where it ended: catch the audio up to it.
                // A seek within what is buffered usually lands at once; one that stalls is checked again.
                for (let tries = 0; tries < CATCH_UPS && spin === current; tries++) {
                    const behind = tapeNow().at - voice.currentTime;
                    if (behind <= IN_STEP) break;
                    voice.currentTime += behind;
                    await new Promise((seeked) => voice.addEventListener('seeked', seeked, { once: true }));
                }
                if (spin !== current) return;
                // The voice takes back over from the tape.
                const at = decoder.currentTime;
                out.gain.setValueAtTime(1, at);
                out.gain.linearRampToValueAtTime(0, at + CUT);
                source.stop(at + CUT);
                // The voice is heard from where the tape is heard, so the highlight follows it on.
                spin = followed = undefined;
                fade(1, CUT);
            }, seconds * 1000);
        }
        fade(0, CUT);
        pending = setTimeout(() => {
            audio!.pause();
            audio!.currentTime = to;
        }, CUT * 1000);
    }

    /**
     * Winds the tape to `to`: forward sped up, back reversed, the speed running from where it is to a
     * peak and slowing into the reader's speed over `WIND`. The speed is a straight line between the
     * two plus half a sine, whose height sets the distance: at least `MIN_BULGE` times the reader's
     * speed, so even a short wind is heard, and never past the max wind speed. A distance outside
     * that range cuts to where a wind can cover the rest; with less tape than that behind the target,
     * the wind starts at the tape's end and slows to fit.
     */
    function windTo(to: number, landed: () => void) {
        const { at, rate, direction: was } = tapeNow();
        const direction = to >= at ? 1 : -1;
        const speed = settings.speed.value;
        const from = direction === was ? rate : speed;
        const line = (k: number) => from + (speed - from) * k;
        const straight = ((from + speed) / 2) * WIND;
        const perBulge = (2 * WIND) / Math.PI;
        const highest = Math.max(0, settings.windSpeed.value - Math.max(from, speed));
        const reach = Math.min(
            Math.max(Math.abs(to - at), straight + MIN_BULGE * speed * perBulge),
            straight + highest * perBulge,
        );
        const distance = Math.min(reach, direction > 0 ? to : tape!.duration - to);
        const rates =
            distance >= straight
                ? curve((k) => line(k) + ((distance - straight) / perBulge) * Math.sin(Math.PI * k))
                : curve((k) => (line(k) * distance) / straight);
        turn(to - direction * travel(rates, WIND), direction, rates, WIND, true, landed);
    }

    /**
     * Jumps to just before a narrated word: straight there when paused or pausing, faded out and in
     * while playing, or wound there in funny mode.
     */
    function seekTo(i: number) {
        if (!audio) return;
        const to = Math.max(0, starts[i] - PRE_ROLL);
        held = { word: i, landed: false };
        const sought = held;
        const land = () => {
            audio!.currentTime = to;
            sought.landed = true;
        };
        if (!playing) {
            stopSpin();
            return land();
        }
        // A seek mid-spin winds on from wherever the tape has got to.
        if (spin || taped()) return windTo(to, () => (sought.landed = true));
        clearTimeout(pending);
        fade(0, FADE_OUT);
        pending = setTimeout(() => {
            land();
            fade(1, FADE_IN);
        }, FADE_OUT * 1000);
    }

    /** Pitch stays put at any speed; a new source would reset the rate, so the default follows too. */
    $effect(() => {
        if (!audio) return;
        audio.preservesPitch = true;
        audio.defaultPlaybackRate = audio.playbackRate = settings.speed.value;
    });
    const speedLabel = $derived(
        `${Number.isInteger(settings.speed.value) ? settings.speed.value.toFixed(1) : settings.speed.value}×`,
    );
    function nextSpeed() {
        settings.speed.value = SPEEDS[(SPEEDS.indexOf(settings.speed.value) + 1) % SPEEDS.length];
    }

    onMount(() => {
        const region = document.querySelector('[data-narration]');
        const host = region?.closest('mia-marker');
        if (!region || !host) return;
        let gone = false;
        const seek = (event: CustomEvent<{ word: number }>) => {
            const i = narratedAt(host, event.detail.word);
            if (i >= 0) seekTo(i);
        };
        (async () => {
            const blocks = narratedBlocks(region);
            const key = pageKey(blocks);
            const response = await fetch(`/narration/pages/${key}.json`);
            if (!response.ok || gone) return;
            const manifest = (await response.json()) as NarrationManifest;
            // The layout defines the marker after its children mount; until then it has no word API.
            await customElements.whenDefined('mia-marker');
            if (gone) return;
            const read = blocks.flatMap((block) => block.words);
            // The key covers the words, so this holds; if it ever didn't, every highlight would be off.
            if (manifest.words.length !== read.length * 2) return;
            spoken = read;
            starts = read.map((_, i) => manifest.words[i * 2]);
            let first = 0;
            blockStarts = blocks.map((block) => (first += block.words.length) - block.words.length);
            host.addEventListener('seek', seek);
            marker = host;
            src = `/narration/audio/${manifest.audio}.mp3`;
        })();
        return () => {
            gone = true;
            clearTimeout(pending);
            stopSpin();
            host.removeEventListener('seek', seek);
            if (marker) marker.word = -1;
            void context?.close();
        };
    });

    /** The last word to have started by `t`, or -1 before the first. */
    function spokenAt(t: number) {
        let [low, high] = [0, starts.length];
        while (low < high) {
            const mid = (low + high) >> 1;
            if (starts[mid] <= t) low = mid + 1;
            else high = mid;
        }
        return low - 1;
    }

    /** Within this long of a block's start, going back goes to the previous block rather than this one's start. */
    const RESTART_WITHIN = 1.5;

    /** The keyboard's way to seek: the next block, or back to this block's start or the one before it. */
    function skip(event: KeyboardEvent) {
        const by = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (!by) return;
        event.preventDefault();
        // A seek still in its fade or pre-roll sits just before its word: count from the word it chose.
        const current = held?.word ?? Math.max(0, spokenAt(time));
        const at = held ? starts[held.word] : time;
        const block = Math.max(
            0,
            blockStarts.findLastIndex((start) => start <= current),
        );
        const into = at - starts[blockStarts[block]];
        const to = by > 0 ? block + 1 : into > RESTART_WITHIN ? block : block - 1;
        if (to >= 0 && to < blockStarts.length) seekTo(blockStarts[to]);
    }

    /**
     * Where the marker's lead last started to build: it grows from nothing after a start, a seek or a
     * tape move, so the marker gets ahead by passing every word rather than skipping to one.
     */
    let anchor = 0;
    /** The narrated word the marker shows, or -1. */
    let shown = -1;

    /** Whether paused audio is still on its way to the ear: for the output's latency after it pauses. */
    let draining = $state(false);
    let drained: ReturnType<typeof setTimeout> | undefined;
    function drain() {
        draining = true;
        clearTimeout(drained);
        drained = setTimeout(() => (draining = false), latency() * 1000);
    }

    $effect(() => {
        if (!marker) return;
        const host = marker;
        const show = (i: number) => {
            shown = i;
            host.word = i >= 0 ? markerWord(host, i) : -1;
        };
        const speed = settings.speed.value;
        // Audio is heard the output's latency after its clock says, so until that long after it
        // pauses; a moving tape is followed where it is heard.
        const sounding = (!paused || draining) && tapeAt === undefined;
        const heard = tapeAt ?? (sounding ? time - latency() * speed : time);
        // A sought word holds through the pre-roll until it is heard, however far the marker leads.
        // A tape winding there is followed until it lands.
        if (held && tapeAt === undefined) {
            if (!held.landed || heard < starts[held.word]) {
                anchor = heard;
                return show(held.word);
            }
            held = undefined;
        }
        // Only the voice the reader is playing leads: a pause or a tape move drops the lead at once.
        if (!(playing && !paused && tapeAt === undefined)) anchor = heard;
        // The marker takes each word up to `lookahead` early, so an edge tuned to lead the voice can.
        // It is wall-clock time, which covers more of the recording at a faster speed.
        const full = (marker.lookahead / 1000) * speed;
        const lead = Math.max(0, Math.min(full, heard - anchor));
        if (!started) return show(-1);
        // While the lead builds, the marker runs ahead faster than the voice: one word per update, so
        // it shows every word on the way.
        const ahead = spokenAt(heard + lead);
        show(lead < full ? Math.max(spokenAt(heard), Math.min(ahead, shown + 1)) : ahead);
    });
</script>

<svelte:document onselectionchange={followSelection} />

{#if src}
    <!--
        Play and pause from elsewhere, such as the lock screen, keep `playing` honest too. Funny mode's
        tape pauses the audio itself while it spins.
    -->
    <audio
        bind:this={audio}
        {src}
        preload="none"
        bind:currentTime={time}
        bind:paused
        onplay={() => (playing = true)}
        onpause={() => {
            drain();
            if (!spin) playing = false;
        }}
        onended={() => (time = 0)}
    ></audio>
    <div class="controls" data-print-hide data-markdown="skip" data-narration-skip>
        <button
            type="button"
            class="listen"
            onclick={() => (playing ? pause() : play())}
            onkeydown={skip}
            aria-label={playing ? 'Pause' : started ? 'Resume listening' : 'Listen to this post'}
            aria-keyshortcuts="ArrowLeft ArrowRight"
        >
            {#if playing}<Pause aria-hidden="true" />{:else if started}<Play aria-hidden="true" />{:else}<Headphones
                    aria-hidden="true"
                />{/if}
        </button>
        <button type="button" class="listen speed mono" onclick={nextSpeed} aria-label="Playback speed {speedLabel}">
            {speedLabel}
        </button>
    </div>
{/if}

<style>
    /* Side by side when floating; stacked in the gutter, which is narrower than two buttons and a gap. */
    .controls {
        display: flex;
    }
    .listen + .listen {
        margin-left: -1px;
    }
    @media (min-width: 1100px) {
        .controls {
            flex-direction: column;
        }
        .listen + .listen {
            margin: -1px 0 0;
        }
    }
    .listen {
        display: inline-grid;
        place-items: center;
        width: 40px;
        height: 40px;
        padding: 0;
        border: 1px solid var(--panel-line);
        background: var(--control);
        color: var(--ink);
        cursor: pointer;
        transition:
            border-color 140ms ease,
            color 140ms ease;
    }
    .listen:hover,
    .listen:focus-visible {
        position: relative;
        border-color: var(--accent);
        color: var(--accent);
    }
    .speed {
        letter-spacing: 0;
        text-transform: none;
    }
    .listen :global(svg) {
        width: 18px;
        height: 18px;
    }
    .listen :global(svg *) {
        vector-effect: non-scaling-stroke;
        stroke-width: 1px;
    }
</style>
