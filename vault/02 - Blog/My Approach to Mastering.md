---
tags:
  - post
publish: true
summary: "A minimal approach, in four parts: spectral consistency, stereo imaging, dynamics and loudness."
created: "2023-09-08T00:00"
modified: "2025-05-18T00:00"
source: "https://github.com/mia-riezebos/mia-riezebos/wiki/Blog:-My-Approach-to-Mastering"
---

I usually take a minimal approach to mastering. In this post I go into detail on 4 main concepts: Spectral Conistency, Stereo Imaging, Dynamics, and Loudness.

## Table of Contents

- [Referencing](#referencing)
	- [Analysis](#analysis)
	- [Benefits](#benefits)
- [Spectral Consistency](#spectral-consistency)
	- [Slope & Tilt](#slope--tilt)
- [Stereo Imaging](#stereo-imaging)
	- [Low-end](#low-end)
	- [Balance](#balance)
- [Dynamics](#dynamics)
	- [Temporal Dynamics](#temporal-dynamics)
	- [Multiband Compression](#multiband-compression)
- [Loudness](#loudness)
- [Other Resources](#other-resources)
- [See Also](#see-also)

## Referencing

First I'd like to address referencing. Learning how to Mix & Master is done through practice, but just as much through study & analysis. 
This analysis doesn't have to be difficult or boring. You can casually (mentally) analyze songs you're listening to while you're traveling for example. Take note of the things that stand out to you when you listen to your favourite music. Try to think about why certain tracks inspire you.

### Analysis 

When mixing & mastering, try to find reference tracks that are similar to yours. Note that it's preferable to find tracks you actually enjoy listening to, but there is value in learning from tracks you *don't* like as well. 
Study your reference tracks & try to figure out:
- **why** these tracks resonate with you
- **what** it is about these tracks that you want to achieve with your track
- **how** they achieve these things

### Benefits

This analysis of other people's music doesn't only help you elevate the track you're currently working on. It's also a great exercise in mindful creativity. Being aware of the what, why and how makes you a more capable artist, by expanding your toolset.
Furthermore, being appreciative of the craft of other creators helps establish better connections with them. Even if you haven't interacted with them yet, knowing more about them and their craft will leave a good impression when you do link up.

## Spectral Consistency

*The track should have as flat of a frequency response as possible, and be consistent with reference tracks within the same or similar genres.*

Your ears don't respond to frequencies in a very "flat" manner. They're much more sensitive to sounds between 300Hz - 6000Hz. You can find a graph of this equal-loudness contour [here](https://en.wikipedia.org/wiki/Equal-loudness_contour). You rarely have to extensively account for this contour in detail, but it's good to keep in mind.

### Slope & Tilt

The most common way to account for this contour is by using a **Slope** or **Tilt**. Most spectrum analyzers have this slope/tilt set to 4.5 dB/oct by default. With this slope you should be able to target a flat frequency response on most tracks. Don't forget to use your ears, though.

I recommend using [Fabfilter Pro-Q 3](https://www.fabfilter.com/products/pro-q-3-equalizer-plug-in) or [Voxengo SPAN](https://www.voxengo.com/product/span/) for spectrum analysis.

![SPAN_Slope](https://github.com/mia-riezebos/mia-riezebos/assets/42698687/32410dc6-b0a7-4403-8fcd-dea86f94e49f)
> Slope set to 4.50 (dB/oct) in [Voxengo SPAN](https://www.voxengo.com/product/span/)

![Pro-Q_3_Tilt](https://github.com/mia-riezebos/mia-riezebos/assets/42698687/0cfc61f5-79a6-4159-8f8a-4c14577e3897)
> Tilt set to 4.5 dB/oct in [Fabfilter Pro-Q 3](https://www.fabfilter.com/products/pro-q-3-equalizer-plug-in)

## Stereo Imaging

Stereo Imaging is considered a vital part of mastering nowadays. In a mastering context, stereo imaging mostly means optimizing mid/side information to maximize the **immersivity** and **impact** of a song. 

It's important to keep in mind that some stereo effects (chorus, haas, pan-split comb filters) affect the **phase response** of your incoming signal. When your track is played on a big sound system in a live setting, a lot of the stereo information is lost and it might not sound how you intended. You can check this by listening to your track in mono.
**Mono-compatibility** has slowly been decreasing in importance, as live sound engineering has improved massively in phase response.

### Low-end 

While checking mono-compatibility for your entire frequency spectrum might be overkill, it is crucial to make sure that your low frequencies don't fall apart when downmixed to mono. Lows are the foundation of your track, regardless of genre. You can ensure low-end quality by:
- simply removing all side information (below 120Hz is a good rule of thumb, but on some tracks I go as high as 300Hz)
- just check and/or remove any phase issues you encounter (some tracks require some side information in the lowend).

### Balance

Lastly, you don't want your track to feel off-balance. You'd usually fix any issues in the mix, but I make a point of double-checking it during the master.

## Dynamics

There are a few things you want to address when looking at the dynamics of your track. I like to split these up by **temporal quality** so it's easier to focus on one thing without getting overwhelmed. **Multiband compression** is also used to improve cohesion within certain frequency ranges.

### Temporal Dynamics

When I'm addressing **short-term** dynamics, I pay attention to peaks in amplitude, specifically transients. It's okay to have some sounds be louder than the rest, that's one of the most effective ways of accentuating. The point of mastering is to introduce some control - to tame the raw composition / mix into something cohesive. You can address transients & peaking with fast-release, zero-attack compressors, or with limiters.

Dealing with **mid-term** dynamics mostly consists of "equalizing" the volume or loudness of adjacent sections in your composition. The easiest way to create impact or contrast between sections is to adjust their volume. This increases the overall dynamic range of the song, though, so I prefer alternative methods like:
- playing with mid/side
- automating diffusion (reverb)
- automating frequency filters (low-cut / high-cut)

**Integrated Dynamic Range** just refers to the difference in volume between the quietest section, and the loudest section of your song. It's imperative that you try to *ignore* the short- & mid-term dynamics when you're looking at your integrated dynamic range, because they may skew your perception.
A good rule of thumb is to keep the quietest & loudest sections within 12dB of each other. Don't stick to this rule too religiously as the norms differ for different **genres**, and for different **playback media**. 
Most notably, when mastering for radio, you want to decrease your dynamic range greatly, as it does not translate well to **car radio**, where you're competing with the noise of the car itself, driving on the road.

### Multiband Compression

I don't usually spend too much time on multiband compression when mastering. I try to keep compression within the mix as much as possible. When elements feel like they need to be **glued** more, I'll add a compressor, sometimes even an MB compressor on instrument buses, or even on sends for parallel compression.

## Loudness

Coming Soon 

## Other Resources

- [Dan Worrall - YouTube](https://www.youtube.com/@DanWorrall)
	- [WTF is Dither? - YouTube](https://youtu.be/2iDrbgfPjPY)
	- [Mixing with Your Eyes - YouTube](https://youtu.be/iZrWMv02tlA)
	- [Extra Notes on Viewing Aliasing & (Non-)Linear - YouTube](https://youtu.be/rw-7fkEDmDw)
- [White Sea Studio - YouTube](https://www.youtube.com/@Whiteseastudio)
- [Fabfilter - YouTube](https://www.youtube.com/@fabfilter)
	- [Mastering with Fabfilter - YouTube](https://www.youtube.com/watch?v=ESVRCT28d5o&list=PLpiuAoPPBEf-OViaOWD0NA6o_V4G8Wueo&index=1)
	- [Beginner's Guide to Compression - YouTube](https://www.youtube.com/watch?v=BIVfpsoPnOo&list=PLpiuAoPPBEf9AstS9I8gavDY4f3weNu7K&index=1)
	> specifically Part 3 goes into some detail on Mastering Compression.
	- [Limiting with Pro-L 2 - YouTube](https://youtu.be/oMJeWXtJODc)
	- [Mid/Side Demystified - YouTube](https://youtu.be/NilfCElGJ2c)
	- [Stereo & Mono Compatibility - YouTube](https://www.youtube.com/watch?v=spaqBr-cCFw&list=PLpiuAoPPBEf-XJR0A-wf43QN8tju25Xdv&index=1)
	- [Aliasing, Samplerates & Oversampling - YouTube](https://youtu.be/-jCwIsT0X8M)

## See Also

- [Mastering (audio) - Wikipedia](https://en.wikipedia.org/wiki/Mastering_(audio))
- [Fabfilter - YouTube](https://www.youtube.com/@fabfilter)
	- [Bus Processing (Glue Compression)](https://youtu.be/P_gnekvbMt8)
	- [Beginner's Guide to EQ](https://www.youtube.com/watch?v=_fDg_pgit5c&list=PLpiuAoPPBEf8-BHRRpo-fkXg9itFn5is5&index=1)
- [Learn - Fabfilter](https://www.fabfilter.com/learn)
	- [Compression - Fabfilter](https://www.fabfilter.com/learn/compression)
	- [Equalization - Fabfilter](https://www.fabfilter.com/learn/equalization)
	- [Mixing - Fabfilter](https://www.fabfilter.com/learn/mixing)
