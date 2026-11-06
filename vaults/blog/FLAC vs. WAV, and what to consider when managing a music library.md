---
tags:
  - post
slug: flac-vs-wav
description: "Lossless means lossless. What actually differs between the formats, and what to keep an archive in."
created_at: "2023-10-27T00:00"
updated_at: "2023-12-30T00:00"
source: "https://github.com/mia-riezebos/mia-riezebos/wiki/Blog:-FLAC-vs.-WAV,-and-Considerations-for-your-Music-Library"
---

FLAC is an audio format with lossless file compression (not-to-be-confused with [Dynamic Range Compression](https://en.wikipedia.org/wiki/Dynamic_range_compression)). This means that, apart from not supporting floating point bit depth, there is no difference in audio quality between FLAC and WAV. When provided with the same [sample sate](https://en.wikipedia.org/wiki/Sampling_(signal_processing)#Sampling_rate) and [bit depth](https://en.wikipedia.org/wiki/Audio_bit_depth), a FLAC file will decode to the exact same [PCM](https://en.wikipedia.org/wiki/Pulse-code_modulation) stream as a WAV file.

FLAC can be compared to ZIP compression, in that data is represented in a way that takes up less disk space than the original, without *losing* any information - [lossless](https://en.wikipedia.org/wiki/Lossless_compression).

Don't take my word for it.

- Get a WAV file ([Start.wav - Wikimedia](https://commons.wikimedia.org/wiki/File:Start.wav))
- Compress the WAV file to FLAC (you can do this with [`ffmpeg`](https://www.ffmpeg.org/), [Audacity](https://www.audacityteam.org/), or [any online converter](https://www.google.com/search?client=firefox-b-d&q=FLAC+converter))
- Open up both the WAV and FLAC files in any multi-channel audio editor ([Audacity](https://www.audacityteam.org/), [LMMS](https://lmms.io/), [Ardour](https://ardour.org/)).
- Reverse the polarity of either audio track

When you hit play in your audio editor, you will notice that there's no sound. Both audio files have decoded to the exact same PCM data. When one's polarity is flipped, then summed with the other, the resulting output is nothing- null.

## Perception & Quality

To say *most* people can't tell a difference between 44.1 kHz and higher sample rates is an understatement, and even audio engineers with decades of experience can't tell (by ear) whether an audio file has has a bit depth higher than 16bit (some engineers, especially those mixing classical music, may be able to tell 16 from 24 bit).

There are use cases for these formats, though.

### Recording

High sample rates are mostly relevant for recording of music stems that you expect to be chained through (digital) saturation, distortion or compression. This can help with aliasing.
This anti-aliasing purpose is mostly redundant with the widespread adoption of super-sampling within VST plugins where this is relevant.

Use cases for bit depth are even more obscure, and it rarely comes into play outside of uncontrolled environments where you need a crazy amount of dynamic range for redundancy.

## The (irrelevant) downsides of FLAC

FLAC is a compressed format, so it needs to be decompressed (decoded) before playback. Because of this decompression requirement, FLAC playback requires more compute power and memory to play than WAV does. 
In the early days, MP3 was favourable, because even though it also required decoding, the files were much smaller, so required a lot less storage and memory. Nowadays, this is largely irrelevant. Most - if not all - consumer-grade media playback devices are more than capable of performing FLAC decoding & playback in real-time, so the only major consideration to make between MP3 and FLAC, is Quality vs. Storage.

## So why FLAC?

The obvious answer is storage. It's not uncommon to see a 2-4x decrease in file size in FLAC, compared to WAV.
What may arguably be more important, though, is FLAC's metadata support. While WAV is (and has to be) a really simple implementation of PCM encoding, FLAC was made with the express purpose of consumer media. This means that FLAC supports a whole lot more embedded metadata, which makes managing large music libraries a lot faster, and easier.

## FLAC vs. MP3

Choosing between WAV and FLAC is fairly obvious, but between FLAC and MP3 you might need to consider more carefully. 

I think if you are building a local (offline) music library, you are probably also in possession of both the gear, and the ears required to tell a difference between MP3 (320kb/s) and FLAC. MP3 though, even at the highest quality settings, usually produces file sizes 2-4x smaller than even FLAC.

If you're syncing your library to a phone with little storage, or don't have the budget for (a) bigger hard drive(s) in your computer, you are probably better off using MP3 for your music library. Phones are also unlikely to discernibly reproduce FLAC, due to Bluetooth compression, or impedance of the headphone amplifier.

When you get to a point where you *really* want that quality upgrade, I recommend getting a NAS to access your media from any device on your network. Or if you want the ability of streaming your music outside your home, you could run a [Nextcloud](https://nextcloud.com/) instance on your NAS, run a server with [Jellyfin](https://jellyfin.org/) or [Plex](https://www.plex.tv/).

## Conclusion
- WAV and FLAC (with the exception of floating point bit depth) produce the exact same PCM-encoded audio and, given the same settings, are nullable.
- The amount of people who can tell 44.1 kHz from higher sample rates or 16 bit from higher bit depths is singular. Using any qualities above these for media consumption is a waste of storage space.
- FLAC has a lot of additional metadata capabilities that WAV does not, which is helpful when managing a music library.
- If you're managing or starting a music library, you can likely tell a difference between MP3-320 so you will have to decide for yourself whether you need the additional compression or not.
- For easy access of your media library look into getting a NAS (local) or running software like [Nextcloud](https://nextcloud.com/), [Jellyfin](https://jellyfin.org/) or [Plex](https://www.plex.tv/) (public) on a server.

You can also find this write-up as a [blog post on my GitHub Wiki](https://github.com/mia-riezebos/mia-riezebos/wiki/Blog:-FLAC-vs.-WAV,-and-Considerations-for-your-Music-Library), where I might update information, and add sources at a later date.
