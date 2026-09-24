<script lang="ts">
    /** The notes on the site that link to this one, from the vault's backlinks. */
    import type { VaultEntry } from '$lib/content/vault';

    let { mentions }: { mentions: (VaultEntry & { href: string })[] } = $props();
</script>

{#if mentions.length}
    <section class="mentions" aria-labelledby="mentions">
        <h2 id="mentions" class="mono">Mentioned in</h2>
        <ul>
            {#each mentions as mention (mention.slug)}
                <li>
                    <a href={mention.href} rel={mention.href.startsWith('/') ? undefined : 'external'}>
                        <span class="title">{mention.title}</span>
                        <span class="note">{mention.description}</span>
                    </a>
                </li>
            {/each}
        </ul>
    </section>
{/if}

<style>
    .mentions {
        margin-top: clamp(40px, 8vh, 72px);
        padding-top: 20px;
        border-top: 1px solid var(--panel-line);
    }
    h2 {
        margin-bottom: 12px;
        color: var(--ink-dim);
        font-size: inherit;
        font-weight: inherit;
    }
    ul {
        display: grid;
        gap: 14px;
    }
    a {
        display: grid;
        gap: 4px;
        text-decoration: none;
    }
    a:hover .title,
    a:focus-visible .title {
        color: var(--accent);
    }
    .title {
        font-size: 19px;
        font-weight: 600;
        font-stretch: 80%;
    }
    .note {
        color: var(--ink-dim);
        font-size: 15px;
    }
</style>
