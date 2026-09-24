<script lang="ts">
    import { contact } from '$lib/content/site';
    import Socials from './Socials.svelte';
</script>

<section id="contact" aria-labelledby="contact-title">
    <h2 id="contact-title" class="visually-hidden">Contact me</h2>
    <a class="email" href="mailto:{contact.email}">{contact.email}</a>
    <Socials panelId="contact-socials" />
</section>

<style>
    section {
        display: grid;
        justify-items: start;
        gap: 22px;
        padding: clamp(40px, 9vh, 96px) 0;
        scroll-margin-top: calc(var(--header-height) + 16px);
    }
    .email {
        font-size: clamp(26px, 4.6vw, 52px);
        font-weight: 620;
        font-stretch: 74%;
        line-height: 1;
        letter-spacing: -0.02em;
        text-decoration: none;
        overflow-wrap: anywhere;
    }
    .email:hover {
        color: var(--accent);
    }
</style>
