---
tags:
  - post
publish: true
summary: "A missed deadline, procrastination, and the first panic attack of my life."
created: "2023-01-28T00:00"
modified: "2024-05-30T00:00"
source: "https://github.com/mia-riezebos/mia-riezebos/wiki/Blog:-Crunch-Time"
---

I had a panic attack for the first time in my life, caused by crunch time, a missed deadline and procrastination.

A couple months ago I was commissioned to design & develop a storefront for a client. 
Find the final product over at https://nuphory.com

They had suggested a timeline for before the holidays so that people could purchase this limited merch run over christmas. 
I misunderstood, thinking this was a soft deadline (rather than a hard deadline), and after a couple days of research into the APIs I needed to use, I started procrastinating. 

Queue 2 months later, about 2 weeks before the holidays (the defined deadline). I’m busy helping my mum move apartments, a couple days a week are lost to this, and I get a message from the client: “What’s the status on the storefront?”
Immediate chaos and stress in my head, but it’s important to communicate a clear status so I tell them I basically only have the template done and have a general idea of how to tackle the project. Reflecting on previous projects, I tell them I’ll be able to finish it in time, with the crunch time I’ve created for myself.

I get to work and get a couple really productive 8-hour work days, but soon find out that I grossly underestimated the scope of this project and it’s looking really grim. Especially with me losing a couple days a week to helping family. 

Eventually it comes to the day before Christmas Eve, and I still have a lot to get done. I decide that I’m going to keep working until everything is finished. The first 8 hours (taking plenty of short breaks), just like a regular work day, I get a ton done, take a dinner break, and come back to work. I get to the checkout flow and find out that the on-demand print shop we’re using doesn’t actually have its own payment capture system in place, whereas, from multiple accounts on stackoverflow, I understood there to be one.
In an hour of heavy stress I end up deciding to use the PayPal SDK, the easiest option to integrate payment without dealing with user auth in this case. However, I still need to research and find out how I can integrate this SDK with my application.

12 hours into a single work session, I have a good understanding of the PayPal SDK, and have started integration of the checkout flow with payment.
While, physically, I feel fine; after 12 hours of intense work, combined with stress, my judgment and thinking is impaired so naturally, my code is infested with tiny bugs that I can’t identify in this state of mind.

I take another longer break to rest and reset a little at around 19 hours. I come back at 20 hours in. The sun is rising, and my situation really sets in now. I’m not going to get this done, but I also can’t afford not to get this done in time. I feel my heart pounding faster, short, fast breaths, and I start getting light-headed. I’m having a panic attack.

I had really recently read about panic attacks through curiosity and identified this one really quickly. I was able to get myself out of this state of panic and stress through deep breaths and meditation. I make peace with the fact that I’m not going to finish this project before the holidays, and decide to just get all the page designs and base functionality finished.
Through a calmer last 5 hours, I identify the source of a lot of bugs and think about how I can tackle them, but in stead of immediately trying to fix them, I just add it to my issue tracker for another day.

After a total work time of 25 hours, I am completely spent, and go to bed. I sleep for maybe 4 hours and then it’s back to family, for Christmas. In between family visits, I get a couple short bug fixes in, and update the client on the status.
When I get back home, I end up needing 2 more 8-hour work days to rewrite a bunch of bad, judgment-impaired code, fix the biggest bugs, and I end up finishing a semi-stable storefront site by the New Year.

Since the client ended up being super busy over the holidays, the deadline was moved, giving me an extension on getting this done (phew).

I end up fixing most bugs and we launch early January.

Now, there were a lot of different things that went wrong here: I misunderstood the deadline, and the scope of the project; I grossly underestimated the scope of what I ended up making; but worst of all, I relied on crunch time.

Crunch time feels very productive, but it has big, unhealthy implications over time. Especially as a solo/freelance developer, without a team to distribute the workload.

Work out a realistic timeline for your project with your client; communicate back to them what you understand you need to do, exactly; give yourself a little breathing room around the hard deadline; and work out a feature roadmap, so you don’t procrastinate as much, if at all.

Code healthy!
