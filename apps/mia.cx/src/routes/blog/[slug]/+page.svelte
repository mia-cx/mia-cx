<script lang="ts">
    import PostArticle from '$lib/components/PostArticle.svelte';

    let { data } = $props();
</script>

<PostArticle post={data.post} html={data.html} mentions={data.mentions} back={{ title: 'Blog', href: '/blog' }} />
