# mia.cx content vault

Open this folder as an Obsidian vault. Everything the site publishes lives here as notes.

Notes are selected by **frontmatter, not by folder**, so file them wherever you like — the numbered
folders are only a starting point.

## Properties

All flat, so Obsidian's core Properties view can edit every one of them. Nothing nested.

| Property   | Type     | Applies to | Meaning                                                        |
| ---------- | -------- | ---------- | -------------------------------------------------------------- |
| `publish`  | checkbox | everything | Off or missing means the note is not on the site                |
| `tags`     | tags     | everything | `post` for the blog. `work/code`, `work/audio`, `work/visual`   |
| `summary`  | text     | everything | The one line shown on cards and in the blog index               |
| `created`  | datetime | everything | Sort order, newest first, and the date shown on posts          |
| `modified` | datetime | everything | Shown as "Updated" when it differs from `created`               |
| `status`   | text     | work       | Free text, e.g. "In development". Shown in the card footer      |
| `year`     | number   | work       | Shown in the card footer                                       |
| `stack`    | list     | work       | Shown in the card footer                                       |
| `live`     | text     | work       | URL of the running thing                                       |
| `source`   | text     | work       | URL of the repository                                          |
| `external` | text     | post       | URL. The index links straight out and no page is generated     |
| `title`    | text     | everything | Overrides the filename, for titles a filename cannot hold      |
| `slug`     | text     | everything | Overrides the URL, for titles that make an unwieldy one        |
| `featured` | checkbox | work       | Shown on the home page                                         |
| `listed`   | checkbox | work       | Shown on /work; unlisted notes stay published in the vault     |

A note tagged with more than one `work/*` kind appears under each of those filters.

## Body

The body is ordinary Markdown and becomes the page. `[[Wikilinks]]` to other published notes turn into
site links; `![[attachments]]` resolve against `99 - Meta/01 - Assets`.

The title comes from the filename, so renaming a note renames its URL.
