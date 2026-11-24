<!--
    Plays a post's narration, highlighting the word being spoken with the page's `<mia-marker>`;
    clicking a word while it plays seeks there, and with the button focused the arrow keys skip between
    paragraphs. The moving highlight is the progress, so the control is one icon button: headphones
    before it starts, then pause or play. A second button beside it cycles the playback speed. The
    reader's settings (`$lib/settings`) can pause it while text is selected, and in funny mode a seek
    winds the tape there instead of fading. It finds the audio by a hash of
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
    /** Every wind takes this long, however far it goes. */
    const WIND = 1.2;
    /** The voice cuts out this quickly as a wind takes over: fast, but without a click. */
    const CUT = 0.03;

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

    function fade(to: number, seconds: number) {
        if (!gain) return;
        const now = gain.context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(to, now + seconds);
    }

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

    function pause() {
        playing = false;
        pausedBySelection = false;
        clearTimeout(pending);
        // Mid-wind the voice is already silent: stop the tape where the wind was headed.
        if (wind) {
            wind.land();
            stopWind();
            audio?.pause();
            return;
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
     * Funny mode's tape: the narration decoded, since an audio element can't play backwards. Loaded
     * once funny mode is on and the narration plays; seeks fade as usual until it is ready.
     */
    let tape: AudioBuffer | undefined;
    let tapeLoad: Promise<void> | undefined;
    $effect(() => {
        if (!settings.funny.value || !playing || tapeLoad || !context || !src) return;
        const decoder = context;
        tapeLoad = fetch(src)
            .then((response) => response.arrayBuffer())
            .then((data) => decoder.decodeAudioData(data))
            .then((buffer) => void (tape = buffer));
    });

    /** The wind playing now: where on the tape it starts and lands, when it began, and how it lands. */
    let wind: { source: AudioBufferSourceNode; from: number; to: number; begun: number; land: () => void } | undefined;

    /** Where the tape is mid-wind: the wind's speed follows half a sine, so its distance follows a cosine. */
    function windAt({ from, to, begun }: NonNullable<typeof wind>, now: number) {
        const progress = Math.min(1, (now - begun) / WIND);
        return from + ((to - from) * (1 - Math.cos(Math.PI * progress))) / 2;
    }

    function stopWind() {
        if (!wind) return;
        wind.source.onended = null;
        wind.source.stop();
        wind = undefined;
    }

    /**
     * Winds the tape from `from` to `to` like a cassette: forward plays the stretch between sped up,
     * back plays it reversed, and the pitch follows the speed. The speed rises from still to its peak
     * and slows into the target over `WIND`, never past the reader's max wind speed. A distance
     * further than that allows cuts to where the wind can still cover the rest.
     */
    function windTo(tapeBuffer: AudioBuffer, from: number, to: number, land: () => void) {
        const decoder = context!;
        const now = decoder.currentTime;
        // Half a sine over `WIND` peaking at the max wind speed covers this much tape.
        const reach = (2 * WIND * settings.windSpeed.value) / Math.PI;
        const forward = to >= from;
        const start = forward ? Math.max(from, to - reach) : Math.min(from, to + reach);
        const span = Math.abs(to - start);
        const rate = tapeBuffer.sampleRate;
        const first = Math.floor(Math.min(start, to) * rate);
        const last = Math.ceil(Math.max(start, to) * rate);
        const stretch = decoder.createBuffer(tapeBuffer.numberOfChannels, Math.max(1, last - first), rate);
        for (let channel = 0; channel < tapeBuffer.numberOfChannels; channel++) {
            const samples = tapeBuffer.getChannelData(channel).slice(first, last);
            if (!forward) samples.reverse();
            stretch.copyToChannel(samples, channel);
        }
        const source = decoder.createBufferSource();
        source.buffer = stretch;
        const peak = (Math.PI * span) / (2 * WIND);
        const steps = 64;
        source.playbackRate.setValueCurveAtTime(
            Float32Array.from({ length: steps + 1 }, (_, k) => peak * Math.sin((Math.PI * k) / steps)),
            now,
            WIND,
        );
        source.connect(decoder.destination);
        source.onended = () => {
            wind = undefined;
            land();
            fade(1, FADE_IN);
            void audio!.play();
        };
        source.start(now);
        source.stop(now + WIND);
        wind = { source, from: start, to, begun: now, land };
        // The voice cuts out as the tape takes over, and waits at the target, loading, until it lands.
        fade(0, CUT);
        pending = setTimeout(() => {
            audio!.pause();
            audio!.currentTime = to;
        }, CUT * 1000);
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
        if (!playing) return land();
        clearTimeout(pending);
        // A seek mid-wind winds on from wherever the tape has got to.
        const winding = wind;
        const from = winding ? windAt(winding, context!.currentTime) : audio.currentTime;
        stopWind();
        if (tape && (winding || (settings.funny.value && settings.motion.value === 'full')))
            return windTo(tape, from, to, land);
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
            stopWind();
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

    $effect(() => {
        if (!marker) return;
        // What's heard trails the audio's clock by the output's latency, large over Bluetooth. The
        // marker takes each word `lookahead` early, so an edge tuned to lead the voice can.
        const heard = time - (context ? context.baseLatency + (context.outputLatency || 0) : 0);
        let i = started ? spokenAt(heard + marker.lookahead / 1000) : -1;
        // A sought word holds through the pre-roll until it is heard, however far the marker leads.
        if (held && (!held.landed || heard < starts[held.word])) i = held.word;
        else held = undefined;
        marker.word = i >= 0 ? markerWord(marker, i) : -1;
    });
</script>

<svelte:document onselectionchange={followSelection} />

{#if src}
    <!--
        Play and pause from elsewhere, such as the lock screen, keep `playing` honest too. A wind pauses
        the audio itself while the tape plays on.
    -->
    <audio
        bind:this={audio}
        {src}
        preload="none"
        bind:currentTime={time}
        bind:paused
        onplay={() => (playing = true)}
        onpause={() => !wind && (playing = false)}
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
