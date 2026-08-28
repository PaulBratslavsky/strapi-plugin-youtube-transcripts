# Changelog

## 2.2.0 - 2026-08-28

Makes the caption download survive YouTube refusing it, and stops the API route
hiding why a fetch failed.

**Retries.** Fetching the caption track failed intermittently and a single
attempt turned that into a failed fetch. The failure is not deterministic:
three identical calls seconds apart produced a 1.4s success, a 36.5s success and
a 40.8s failure. YouTube rate limits large caption downloads, hardest from a
residential address, and one refusal was enough to lose the transcript.

Three attempts now, with 1s then 3s of backoff, and a 25s ceiling per attempt so
one hung request cannot consume the whole budget. Measured on the transcript
that was failing: five consecutive direct fetches, no proxy, five successes,
where the same video previously failed one run in three.

**The API route reported nothing.** Every failure came back as
`ctx.throw(500, message)`, and Koa hides the message on any 5xx, so the response
was a bare `Internal Server Error`. A video with no captions, a mistyped id and
YouTube refusing the request were indistinguishable, and all three read as a bug
in this plugin. Failures are now classified: 404 when the video genuinely has
nothing to fetch, 502 when YouTube would not return it, both carrying the reason.

## 2.1.1 - 2026-08-27

Fixes the peer dependency, which named a package that no longer receives
updates. It was `strapi-plugin-ai-sdk@^2.0.0`; that package is frozen at 2.6.0
under a name the hub plugin has since left behind, and the range excluded the
current release anyway. It is now `strapi-plugin-ai-chat@^3.0.0`, still optional
because this plugin works standalone and only exposes AI tools when the hub is
installed.

Also adds `repository`, `homepage` and `bugs`, which were missing entirely, so
npm had no link back to the source, and updates the README's references to the
hub's old name.

## 2.1.0 - 2026-08-27

Captures the video metadata that was already being fetched and thrown away.

A transcript row held a title and the text, nothing else. The YouTube response
the fetch already makes carries far more, so this costs no extra request. It was
being lost to narrowing: the fetch util returned four fields, the service
re-listed those same four, and the tool listed them a third time. Each layer
independently re-declared the shape, so metadata was dropped three times over.
Those now spread, and the next field added flows through without editing three
files.

New fields: `author`, `channelId`, `thumbnailUrl`, `durationSec`,
`description`, `keywords`, `category`, `videoPublishedAt`, `language`, and
`fetchedAt`.

`viewCount` and `likeCount` are deliberately absent. They are volatile counters
that would be stale the moment they were written, and a stored figure that looks
authoritative is worse than no figure. Session-specific flags from the same
response (`is_liked`, `is_owner_viewing` and friends) are left out for the same
reason: they describe the account doing the fetching, not the video.

The field is `videoPublishedAt`, not `publishedAt`, because Strapi reserves that
name for draft-and-publish state. A custom field of that name is never the value
you set and is never null.

**Backfill for existing rows.** Rows stored before this release have null
metadata. `backfillMetadata: true` in plugin config refetches it after boot, or
call `strapi.plugin('youtube-transcripts').service('transcript').backfillMetadata()`.

It is opt-in because it makes one YouTube request per stored video, which is not
something a plugin should start on someone's behalf. It only touches rows
actually missing metadata, so a second run costs nothing. It never replaces the
stored transcript: captions can change or disappear, and silently overwriting
good text with a worse copy would be far more damaging than a null thumbnail.
One video at a time with a pause between.

## 2.0.0 - 2026-08-27

**Breaking.** The plugin id changed from `ai-sdk-yt-transcripts` to
`youtube-transcripts`, and the database table from `transcript` to
`youtube_transcripts`. A migration ships with the release and runs on first
boot.

**What you must do:** rename the key in `config/plugins.ts`.

```diff
-'ai-sdk-yt-transcripts': {
+'youtube-transcripts': {
   enabled: true,
 }
```

**What the migration does for you:** renames the table in place, preserving rows
and ids, and rewrites every `plugin::ai-sdk-yt-transcripts.*` permission grant.
It runs in `register()`, the only point where the rename can happen before
Strapi's schema sync creates the new table and orphans the old one beside it. It
is idempotent and logs rather than throws, so a failed migration cannot take the
host down.

**Why.** The old id named a plugin this one does not depend on, and it prefixed
every tool name and permission action. The old table name was worse: plain
`transcript`, with no namespace at all, which any other plugin or content type
could have taken.

Tool names change accordingly, from `ai-sdk-yt-transcripts__fetchTranscript` to
`youtube-transcripts__fetchTranscript`.

## 1.3.0 - 2026-08-26

Renamed on npm from `strapi-plugin-ai-sdk-yt-transcripts` to
`strapi-plugin-youtube-transcripts`. The old name advertised a dependency that
does not exist: this plugin works standalone and exposes AI tools only when
`strapi-plugin-ai-chat` happens to be installed.

## 1.2.0 - 2026-08-24

`findTranscripts` no longer returns every timecode of every match. One 12 minute
video came to about 31KB, roughly 7,800 tokens, from a tool whose job is to say
which videos matched. Search results now omit timecodes and report
`segmentCount` instead: 31,440 bytes became 950. `includeFullContent: true` is
unchanged.

`extractYouTubeID` accepts `youtu.be` links, the format YouTube's own share
button produces, along with `/embed/`, `/live/` and the `m.` and `music.`
subdomains. It previously rejected them as invalid.

Adds a test suite, where the plugin previously had only typechecks.
