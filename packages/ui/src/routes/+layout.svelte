<script lang="ts">
	import PageTransition from '$lib/layout/PageTransition.svelte';
	import { onMount, type Snippet } from 'svelte';
	import type { LayoutData } from './$types.js';

	import { browser } from '$app/environment';
	import Footer from '$lib/layout/footer/Footer.svelte';
	import Header from '$lib/layout/header/Header.svelte';
	import '$lib/styles/app.css';
	import { expoOut } from 'svelte/easing';
	import { scale } from 'svelte/transition';

	// export let data: LayoutData;
	// $: url = data.url;

	let {
		data,
		children,
	}: {
		data: LayoutData;
		children: Snippet;
	} = $props();

	console.log(data.url.pathname);

	let ready = $state(false);

	onMount(() => {
		ready = true;
	});
</script>

{#snippet layout()}
	<Header />
	<PageTransition
		url="{data.url.pathname}"
		{children} />
	<Footer />
{/snippet}

{#if browser}
	{#if ready}
		<div
			in:scale="{{
				duration: 1500,
				easing: expoOut,
				start: 1.01,
				opacity: 0,
			}}">
			{@render layout()}
		</div>
	{/if}
{:else}
	{@render layout()}
{/if}
