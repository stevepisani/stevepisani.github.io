---
layout: post
title:  "Rockets and Horses"
date:   2020-11-05T15:52:00+00:00
image_url: /assets/images/rockets.webp
description: "The internet says two Roman horses sized the Space Shuttle's boosters. They didn't, but the true story is better: a walk along one track."
---

One of my favorite bits of Internet lore says the rocket boosters on the Space Shuttle were sized by the back ends of two Roman war horses. As told, it [doesn't hold up](https://www.snopes.com/fact-check/railroad-gauge-chariots/). The true version is better. Here it is, one stop at a time, walking back along the track:

{% include gauge-walk.html %}

So no, a horse didn't design the Space Shuttle. But rails laid out for horse-drawn coal wagons became the standard for most of the world, and the Shuttle's boosters were built in pieces so they could ride those rails.

The headline in my mind is that `design decisions propagate`.

Stephenson's choice of "whatever the coal wagons used" got passed along over and over, simply because each new line had to connect to the last. Changing it got more expensive every year. The American South needed an army of track crews and two days to do it. Britain needed an Act of Parliament.

At each stage in the design tree from horse to spaceship, no one said "welp, gotta keep this to the original horse spec." They kept it because it was already built. No need to redo the work. What gets my attention is the boosters. Rail travel is a big part of why they came in segments, and a joint between segments is where Challenger's O-rings failed in 1986. The Rogers Commission blamed the joint's design, the cold, and the decision to launch, not the railroad. Still, a constraint nobody chose for rockets ended up built into one.

Back down on a micro level, the decisions _we_ make can propagate farther than we anticipated. Writing new backend code for your company's web app? Whatever comes next is probably going to build on top of it. Designing a database structure? Whatever comes next is probably going to build on top of it.

All of this is my long-winded way of saying:
_when you're making something, take the time to understand the constraints that might be piggybacking on your work, and whether they're holding you back._

###### Note: <br> I don't remember where I first heard the SRB to horse story but I came across it most recently in [Joe Celko's "SQL for Smarties"](https://www.amazon.com/Joe-Celkos-SQL-Smarties-Programming/dp/0128007613?sa-no-redirect=1&pldnSite=1) which I highly recommend.

###### Note2: Tangentially related, here is Richard Feynman's explanation of why train axles don't need differentials: https://youtu.be/WAwDvbIfkos
