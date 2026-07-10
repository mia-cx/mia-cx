<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	export let height = '4rem';

	onMount(() => {
		if (browser) {
			document.documentElement.style.setProperty('--header-height', height);
		}
	});
</script>

<header
	class="z-10 sticky top-0 flex items-center h-[var(--header-height)] hover:[&_a]:text-primary font-bold bg-neutral"
>
	<div class="container flex items-center gap-4 sm:gap-8">
		<!-- TODO Hamburger -->
		<span class="flex-1"><a href="/" class="reset">mia.cx</a></span>
		<nav class="flex gap-3 text-sm sm:gap-8 sm:text-base">
			<a class="reset" href="/projects">Projects</a>
			<a class="reset" href="/blog">Blog</a>
			<a class="reset" href="/contact">Contact</a>
			<a class="reset" href="https://ffm.bio/patch">Music</a>
		</nav>
	</div>
</header>

<style lang="scss">
	/* your styles go here */
	:global(html) {
		scroll-padding-top: calc(1rem + var(--header-height));
	}
</style>
