<!-- @format -->

# mia.cx content vaults

Two Obsidian vaults, one per section of mia.cx. Open `work` or `blog` as a vault on its own.
[Svartz](https://github.com/mia-cx/svartz) publishes both, as configured in `apps/mia.cx/svartz.config.ts`:

| Vault  | Section | Pages          |
| ------ | ------- | -------------- |
| `work` | `/work` | `/work/<note>` |
| `blog` | `/blog` | `/blog/<note>` |

Every published note in a vault, at any depth, is an entry in its section. A note gets a page of its own when it has a
body; otherwise its card links straight out.

## Properties

All flat, so Obsidian's core Properties view can edit every one of them. Nothing nested.

| Property      | Type     | Applies to | Meaning                                                        |
| ------------- | -------- | ---------- | -------------------------------------------------------------- |
| `draft`       | checkbox | everything | `true` hides the note. Missing means published                 |
| `title`       | text     | everything | Overrides the filename, for titles a filename cannot hold      |
| `description` | text     | everything | The one line shown on cards and in the blog index              |
| `tags`        | tags     | everything | `work/code`, `work/audio`, `work/visual` set the /work filters |
| `aliases`     | list     | everything | Other names wikilinks can use for the note                     |
| `created_at`  | datetime | everything | Sort order, newest first, and the date shown on posts          |
| `updated_at`  | datetime | everything | Shown as "Updated" when it differs from `created_at`           |
| `slug`        | text     | everything | Overrides the URL, for filenames that make an unwieldy one     |
| `status`      | text     | work       | Free text, e.g. "In development". Shown in the card footer     |
| `year`        | number   | work       | Shown in the card footer                                       |
| `stack`       | list     | work       | Shown in the card footer                                       |
| `live`        | text     | work       | URL of the running thing                                       |
| `source`      | text     | work, post | URL of the repository, or where a post was first published     |
| `featured`    | checkbox | work       | Shown on the home page                                         |
| `listed`      | checkbox | work       | Shown on /work; unlisted notes still get their page            |
| `external`    | text     | post       | URL. The blog links straight out and no page is generated      |

`description` is required on a note without a body; Svartz takes one from the first sentences of a body otherwise. Posts
need a `created_at`. A note tagged with more than one `work/*` kind appears under each of those filters.

## Body

The body is ordinary Obsidian Markdown and becomes the page. Start sections at `##`: the page's title is its only `#`.
`[[Wikilinks]]` resolve by filename, `title` or `aliases`, and `[[Note#Heading]]` links to the heading. A link to a note
in the other vault doesn't resolve yet; link to its URL instead. Every page lists the notes in its vault that mention
it. `![[attachments]]` resolve anywhere in the vault.

The URL comes from the filename (or `slug`), normalised: `Software I Use.md` is `/blog/software-i-use`. Renaming a note
renames its URL, so set `slug` to keep an old one.
