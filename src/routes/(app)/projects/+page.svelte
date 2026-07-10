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
			name: 'ditherette',
			description: 'An in-browser image dithering and colour-conversion tool.',
			language: 'TypeScript'
		},
		{
			owner: 'mia-cx',
			name: 'rule-composer',
			description:
				'A command-line tool for writing AI coding-agent rules once and generating variants for multiple supported tools.',
			language: 'TypeScript'
		},
		{
			owner: 'mia-cx',
			name: 'drizzle-query-factory',
			description:
				'A declarative, composable query-parameter parser that produces typed filtering, sorting, and pagination for Drizzle ORM.',
			language: 'TypeScript'
		},
		{
			owner: 'mia-riezebos',
			name: 'lossless-url-compressor',
			description:
				'A work-in-progress specification and TypeScript proof of concept for deterministic, stateless, lossless URL compression.',
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

<section class="container py-8 md:py-16">
	<div class="max-w-4xl">
		<h1>Projects</h1>
		<p>A selection of public projects and experiments.</p>

		<ul class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
			{#each projects as project}
				<li class="border border-current/20 rounded-xl p-6">
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
