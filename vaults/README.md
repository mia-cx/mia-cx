<!-- @format -->

# mia.cx content vault

One Obsidian vault: open this `vaults` folder. [Svartz](https://github.com/mia-cx/svartz) publishes it at the site root,
as configured in `apps/mia.cx/svartz.config.ts`, so each folder is the section of the same name:

| Note                       | Is a         | Page                     |
| -------------------------- | ------------ | ------------------------ |
| `work/<Project>.md`        | project      | `/work/<project>`        |
| `work/<Project>/index.md`  | project      | `/work/<project>`        |
| `work/<Project>/<Post>.md` | project post | `/work/<project>/<post>` |
| `blog/<Post>.md`           | post         | `/blog/<post>`           |

A project is a flat note, or a folder whose `index.md` is its overview. Every other note in a project folder is a post
about that project and must be tagged `post`. Its project's page lists it under the body, and /blog lists it beside the
posts in `blog/`, linking to its page under the project. /work and the home page list projects only.

A flat project gets a page of its own when it has a body; otherwise its card links straight out. A project folder always
gets a page, to list its posts. Nothing nests deeper than a project folder.

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
| `narration`   | checkbox | post       | Read aloud in Mia's voice. Missing means no audio              |

`description` is required on a note without a body; Svartz takes one from the first sentences of a body otherwise.
Posts, project posts included, need a `created_at`. A draft is invisible everywhere, so a post can be written in its
project folder with `draft: true` and published by unticking it. A note tagged with more than one `work/*` kind appears
under each of those filters.

## Body

The body is ordinary Obsidian Markdown and becomes the page. Start sections at `##`: the page's title is its only `#`.
`[[Wikilinks]]` resolve by filename, `title` or `aliases`, across `work/` and `blog/`, and `[[Note#Heading]]` links to
the heading. Every page lists the notes that mention it. `![[attachments]]` resolve anywhere in the vault.

The URL comes from the filename (or `slug`), normalised: `Software I Use.md` is `/blog/software-i-use`. Renaming a note
renames its URL, so set `slug` to keep an old one. A project folder's `index.md` takes its URL from the folder and
cannot set `slug`; rename the folder instead. Give it a `title` too: the Svartz release this site uses still titles it
"index".
