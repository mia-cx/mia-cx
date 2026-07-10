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

<section class="container py-10 md:py-20">
	<div class="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)] md:gap-12">
		<div>
			<p class="font-bold uppercase tracking-[0.2em] text-primary">Error {$page.status}</p>
			<h1 class="mt-2">{title}</h1>
			<p class="mt-4 max-w-xl text-lg">{description}</p>

			<div class="mt-8 flex flex-col gap-3 sm:flex-row">
				<a
					class="reset group inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-neutral"
					href="/"
				>
					Go home
					<iconify-icon icon="lucide:arrow-right" class="group-hover:translate-x-0.5" />
				</a>
				<a
					class="reset group inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-current/20 px-5 py-3 font-bold hover:border-current/50"
					href="/contact"
				>
					Contact Mia
					<iconify-icon icon="lucide:arrow-right" class="group-hover:translate-x-0.5" />
				</a>
			</div>
		</div>

		<p
			class="hidden select-none text-right text-[clamp(7rem,24vw,12rem)] font-bold leading-none text-primary opacity-20 md:block"
			aria-hidden="true"
		>
			{$page.status}
		</p>
	</div>
</section>
