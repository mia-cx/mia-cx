<!-- @format -->

# mia.cx content vault

Open this folder as an Obsidian vault. It follows Svartz's conventions, so the same notes can feed a site of their own
as well as the work and blog sections of mia.cx.

## Sections

mia.cx publishes by **folder**. A folder becomes a section when it holds an `_index.md` whose `slug` names one:

```markdown
---
title: Work
slug: work
---
```

The folder can be called anything, so numbered folders like `01 - Work` keep their order on disk while the site keeps
`/work`. Every published note under that folder, at any depth, gets a page at `/<section>/<note>`. mia.cx has pages for
`work` and `blog`; other sections are ignored.

## Properties

All flat, so Obsidian's core Properties view can edit every one of them. Nothing nested.

| Property      | Type     | Applies to | Meaning                                                        |
| ------------- | -------- | ---------- | -------------------------------------------------------------- |
| `published`   | checkbox | everything | `false` hides the note. Missing means published, as in Svartz  |
| `title`       | text     | everything | Overrides the filename, for titles a filename cannot hold      |
| `description` | text     | everything | The one line shown on cards and in the blog index              |
| `tags`        | tags     | everything | `work/code`, `work/audio`, `work/visual` set the /work filters |
| `aliases`     | list     | everything | Other names wikilinks can use for the note                     |
| `created_at`  | datetime | everything | Sort order, newest first, and the date shown on posts          |
| `updated_at`  | datetime | everything | Shown as "Updated" when it differs from `created_at`           |
| `slug`        | text     | everything | Overrides the URL, for titles that make an unwieldy one        |
| `status`      | text     | work       | Free text, e.g. "In development". Shown in the card footer     |
| `year`        | number   | work       | Shown in the card footer                                       |
| `stack`       | list     | work       | Shown in the card footer                                       |
| `live`        | text     | work       | URL of the running thing                                       |
| `source`      | text     | work, post | URL of the repository, or where a post was first published     |
| `featured`    | checkbox | work       | Shown on the home page                                         |
| `listed`      | checkbox | work       | Shown on /work; unlisted notes still get their page            |
| `external`    | text     | post       | URL. The blog links straight out and no page is generated      |

`description` and, for posts, `created_at` are required. A note tagged with more than one `work/*` kind appears under
each of those filters.

## Body

The body is ordinary Markdown and becomes the page. `[[Wikilinks]]` resolve by filename, `title` or `aliases`, and
`[[Note#Heading]]` links to the heading. Links between work and blog notes become site links, and every page lists the
notes that mention it. A link to a note outside the sections, or to a post while the blog is off, renders as plain text.
`![[attachments]]` resolve anywhere in the vault.

The URL comes from the title (or `slug`), so renaming a note renames its URL.
