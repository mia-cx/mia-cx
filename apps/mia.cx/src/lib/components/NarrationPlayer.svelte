<!--
    Plays a post's narration, highlighting the word being spoken with the page's `<mia-marker>`;
    clicking a word while it plays seeks there, and with the button focused the arrow keys skip between
    paragraphs. The moving highlight is the progress, so the control is one icon button: headphones
    before it starts, then pause or play. It finds the audio by a hash of
    exactly what the page reads (`$lib/narration/extract`), so it appears only once that text has been
    narrated.
-->
<script lang="ts">
    import { onMount } from 'svelte';
    import Headphones from '~icons/lucide/headphones';
    import Pause from '~icons/lucide/pause';
    import Play from '~icons/lucide/play';
    import { narratedBlocks, pageKey, type NarratedWord, type NarrationManifest } from '$lib/narration/extract';

    /** Seeks land this long before the word, since the timings can run a little late. */
    const PRE_ROLL = 0.3;
    const FADE_IN = 0.25;
    const FADE_OUT = 0.12;

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
        fade(0, FADE_OUT);
        clearTimeout(pending);
        pending = setTimeout(() => audio?.pause(), FADE_OUT * 1000);
    }

    /**
     * Jumps to just before a narrated word: straight there when paused or pausing, faded out and in
     * while playing.
     */
    function seekTo(i: number) {
        if (!audio) return;
        held = { word: i, landed: false };
        const land = () => {
            audio!.currentTime = Math.max(0, starts[i] - PRE_ROLL);
            held!.landed = true;
        };
        if (!playing) return land();
        fade(0, FADE_OUT);
        clearTimeout(pending);
        pending = setTimeout(() => {
            land();
            fade(1, FADE_IN);
        }, FADE_OUT * 1000);
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
        const current = Math.max(0, spokenAt(time));
        const block = Math.max(
            0,
            blockStarts.findLastIndex((start) => start <= current),
        );
        const into = time - starts[blockStarts[block]];
        const to = by > 0 ? block + 1 : into > RESTART_WITHIN ? block : block - 1;
        if (to >= 0 && to < blockStarts.length) seekTo(blockStarts[to]);
    }

    $effect(() => {
        if (!marker) return;
        // What's heard trails the audio's clock by the output's latency, large over Bluetooth.
        const heard = time - (context ? context.baseLatency + (context.outputLatency || 0) : 0);
        let i = started ? spokenAt(heard) : -1;
        if (held && (!held.landed || heard < starts[held.word])) i = held.word;
        else held = undefined;
        marker.word = i >= 0 ? markerWord(marker, i) : -1;
    });
</script>

{#if src}
    <!-- Play and pause from elsewhere, such as the lock screen, keep `playing` honest too. -->
    <audio
        bind:this={audio}
        {src}
        preload="none"
        bind:currentTime={time}
        bind:paused
        onplay={() => (playing = true)}
        onpause={() => (playing = false)}
        onended={() => (time = 0)}
    ></audio>
    <button
        type="button"
        class="listen"
        onclick={() => (playing ? pause() : play())}
        onkeydown={skip}
        aria-label={playing ? 'Pause' : started ? 'Resume listening' : 'Listen to this post'}
        aria-keyshortcuts="ArrowLeft ArrowRight"
        data-print-hide
        data-markdown="skip"
        data-narration-skip
    >
        {#if playing}<Pause aria-hidden="true" />{:else if started}<Play aria-hidden="true" />{:else}<Headphones
                aria-hidden="true"
            />{/if}
    </button>
{/if}

<style>
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
        border-color: var(--accent);
        color: var(--accent);
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
