<script lang="ts">
    /** Icons compile to inline SVG at build time, so this maps an id onto a component. */
    import Applemusic from '~icons/simple-icons/applemusic';
    import Bandcamp from '~icons/simple-icons/bandcamp';
    import Bluesky from '~icons/simple-icons/bluesky';
    import Discord from '~icons/simple-icons/discord';
    import Github from '~icons/simple-icons/github';
    import Instagram from '~icons/simple-icons/instagram';
    import Linkedin from '~icons/simple-icons/linkedin';
    import Newgrounds from '~icons/simple-icons/newgrounds';
    import Soundcloud from '~icons/simple-icons/soundcloud';
    import Spotify from '~icons/simple-icons/spotify';
    import Tidal from '~icons/simple-icons/tidal';
    import Tiktok from '~icons/simple-icons/tiktok';
    import X from '~icons/simple-icons/x';
    import Youtube from '~icons/simple-icons/youtube';
    import type { SocialId } from './socials';

    let { id }: { id: SocialId } = $props();

    const icons = {
        applemusic: Applemusic,
        bandcamp: Bandcamp,
        bluesky: Bluesky,
        discord: Discord,
        github: Github,
        instagram: Instagram,
        linkedin: Linkedin,
        newgrounds: Newgrounds,
        soundcloud: Soundcloud,
        spotify: Spotify,
        tidal: Tidal,
        tiktok: Tiktok,
        x: X,
        youtube: Youtube,
    };
    const Icon = $derived(icons[id]);
</script>

<Icon aria-hidden="true" />
