<script lang="ts">
	import portrait from '$lib/assets/img/portrait.jpg?format=webp&w=320;480;640;720;900;1080;1200;1440;1600;1920;2560;3840&fit=inside&rotate=270&withoutEnlargement&as=srcset';

	console.debug('portrait', portrait);
</script>

<!-- Coming Soon -->
<section id="coming-soon" class="justify-self-center">
	<div
		class="container flex-shrink flex max-md:flex-col items-center justify-between gap-8 md:gap-32 py-8 md:py-16"
	>
		<div id="portrait" class="max-md:container !px-0 md:order-1 flex-none md:h-[50vh] md:h-[50svh]">
			<img
				srcset={portrait}
				alt="Portrait of Mia Riezebos"
				class="w-full aspect-[1.5] md:h-full md:aspect-[0.8] object-cover rounded-xl"
			/>
		</div>
		<div id="contact">
			<h1>Coming Soon</h1>
			<p>This website is currently in development. Please check back soon.</p>
			<br />
			<p>
				If you have an inquiry or would like to get in touch, please email Mia Riezebos at
				<a class="group" href="mailto:contact@mia.cx">
					contact@mia.cx
					<iconify-icon
						icon="lucide:arrow-up-right"
						class="opacity-50 group-hover:opacity-100 -ml-1"
					/>
				</a>, or send a WhatsApp message to
				<a class="group" href="https://wa.me/message/K6JIESWVSFVBN1">
					‪+31 31 72 250 05‬
					<iconify-icon
						icon="lucide:arrow-up-right"
						class="opacity-50 group-hover:opacity-100 -ml-1"
					/>
				</a>.
			</p>
			<br />
			<p>
				Alternatively, you can add me on discord:
				<a class="group" href="https://discord.com/users/209048057441026049">
					@patchstep
					<iconify-icon
						icon="lucide:arrow-up-right"
						class="opacity-50 group-hover:opacity-100 -ml-1"
					/>
				</a>
			</p>
		</div>
	</div>
</section>
