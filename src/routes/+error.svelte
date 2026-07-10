<script lang="ts">
	import { page } from '$app/stores';

	$: isNotFound = $page.status === 404;
	$: title = isNotFound ? 'Page not found' : 'Something went wrong';
	$: description = isNotFound
		? 'The page you were looking for does not exist or may have moved.'
		: 'The site ran into an unexpected problem. Please try again in a moment.';
</script>

<svelte:head>
	<title>{$page.status} — {title} | mia.cx</title>
	<meta name="description" content={description} />
</svelte:head>

<section class="container py-8 md:py-16">
	<div class="max-w-3xl">
		<h1>{$page.status}: {title}</h1>
		<p>{description}</p>

		<nav class="mt-8 flex flex-col items-start gap-2" aria-label="Error recovery">
			<a class="group inline-flex items-center gap-1 font-bold" href="/">
				Go home
				<iconify-icon icon="lucide:arrow-right" class="opacity-50 group-hover:opacity-100" />
			</a>
			<a class="group inline-flex items-center gap-1 font-bold" href="/contact">
				Contact Mia
				<iconify-icon icon="lucide:arrow-right" class="opacity-50 group-hover:opacity-100" />
			</a>
		</nav>
	</div>
</section>
