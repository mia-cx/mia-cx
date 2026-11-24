<script lang="ts">
    import PostArticle from '$lib/components/PostArticle.svelte';

    let { data } = $props();
</script>

<PostArticle {...data} back={{ title: 'Blog', href: '/blog' }} />
