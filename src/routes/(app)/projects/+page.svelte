<script lang="ts">
	type Project = {
		owner: string;
		name: string;
		description: string;
		language: string;
	};

	const projects: Project[] = [
		{
			owner: 'vesta-cx',
			name: 'vesta',
			description:
				'An all-in-one platform for independent musicians, small labels, and creative publishers to manage their catalog, build their brand, and reach their audience.',
			language: 'TypeScript'
		},
		{
			owner: 'mia-cx',
			name: 'maal',
			description:
				'A flexible meal-planning and household logistics app built around floating schedules, recipe imports, grocery demand, and capacity-aware planning.',
			language: 'TypeScript'
		},
		{
			owner: 'mia-cx',
			name: 'honeybot',
			description:
				'A self-hosted Discord moderation bot that catches scam and spam raids using honeypots, repeat detection, evidence matching, AI classifiers, and moderator review.',
			language: 'TypeScript'
		},
		{
			owner: 'mia-riezebos',
			name: 'patch',
			description:
				'A Discord harness for a locally hosted LLM designed as a conversational server character with her own voice, taste, boundaries, and timing.',
			language: 'TypeScript'
		},
		{
			owner: 'mia-cx',
			name: 'ditherette',
			description: 'An in-browser image dithering and colour-conversion tool.',
			language: 'TypeScript'
		},
		{
			owner: 'mia-riezebos',
			name: 'novel-audio-codec-experiment',
			description:
				'A dependency-free Rust prototype exploring a perceptually native audio codec with transform coding and psychoacoustic shaping.',
			language: 'Rust'
		}
	];
</script>

<svelte:head>
	<title>Projects | mia.cx</title>
	<meta name="description" content="A selection of public projects and experiments by Mia Riezebos." />
</svelte:head>

<section class="container py-8 md:py-16">
	<div class="max-w-4xl">
		<h1>Projects</h1>
		<p>A selection of public projects and experiments.</p>

		<ul class="mt-8 divide-y divide-current/20" data-testid="project-list">
			{#each projects as project}
				<li class="py-6 first:pt-0 last:pb-0">
					<a
						class="group inline-flex items-center gap-1 font-bold"
						href={`https://github.com/${project.owner}/${project.name}`}
						target="_blank"
						rel="noreferrer"
					>
						{project.owner}/{project.name}
						<iconify-icon
							icon="lucide:arrow-up-right"
							class="opacity-50 group-hover:opacity-100"
						/>
					</a>
					<p class="mt-3">{project.description}</p>
					<p class="mt-4 text-sm opacity-60">{project.language}</p>
				</li>
			{/each}
		</ul>
	</div>
</section>
