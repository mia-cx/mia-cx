<script lang="ts">
    import PostArticle from '$lib/components/PostArticle.svelte';

    let { data } = $props();
</script>

<!-- Every post at this route sits in a project folder, so it always has a project to go back to. -->
<PostArticle
    post={data.post}
    html={data.html}
    mentions={data.mentions}
    back={data.post.project ?? { title: 'Work', href: '/work' }}
/>
