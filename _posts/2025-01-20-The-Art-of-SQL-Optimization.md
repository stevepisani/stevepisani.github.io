---
layout: post
title: "Slow SQL Is Usually One of Four Things"
date: 2025-01-20T14:30:00+00:00
description: "Before you touch a slow query in the warehouse, read its profile. It's almost always scanning too much, a join that explodes, spilling, or doing the same work twice."
---

The first version of this post read like a textbook. It also had capitalized keywords. On my blog. After I wrote a [whole style guide](/2021/02/15/SQL-Style-Guide.html) against them.

So here's the version I'd actually tell you at the bar: in a warehouse like Snowflake, a slow query is almost always one of four things, and the query profile tells you which one before you change a single line.

## Read the profile first

Every warehouse will show you where the time went. In Snowflake it's the Query Profile: a tree of operators, each with its share of the time. Find the biggest one. That's the whole job.

<figure class="fig">
<svg viewBox="0 0 720 230" role="img" aria-labelledby="f1t">
<title id="f1t">A query profile: the table scan takes 71% of the time, the join 18%, the aggregate 7%, the sort 4%.</title>
<text x="0" y="24" class="lbl">operator</text><text x="170" y="24" class="lbl">share of the query's time</text>
<text x="0" y="62">TableScan</text><rect x="170" y="44" width="390" height="26" rx="5" class="hot"/><text x="182" y="63" class="on-hot">71%</text>
<text x="0" y="110">Join</text><rect x="170" y="92" width="99" height="26" rx="5" class="soft"/><text x="281" y="111">18%</text>
<text x="0" y="158">Aggregate</text><rect x="170" y="140" width="39" height="26" rx="5" class="soft"/><text x="221" y="159">7%</text>
<text x="0" y="206">Sort</text><rect x="170" y="188" width="22" height="26" rx="5" class="soft"/><text x="204" y="207">4%</text>
</svg>
<figcaption>What most slow queries look like (made-up numbers, real shape). One operator eats the clock. Fix that one and ignore the rest.</figcaption>
</figure>

Then match it to one of these.

## 1. Scanning more than you need

Snowflake stores a table as micro-partitions, chunks of roughly 50 to 500 MB, and keeps the min and max of every column for each one. When your `where` clause rules a partition out, Snowflake never reads it. That's pruning, and it's most of the game.

The profile tells you how it went: **Partitions scanned** against **Partitions total**. If those two numbers are close and you only wanted one day of data, you found it.

<figure class="fig">
<svg viewBox="0 0 720 200" role="img" aria-labelledby="f2t">
<title id="f2t">Forty partitions in a grid. A filter on one day lights up three of them; the other thirty-seven are skipped.</title>
<g transform="translate(0,10)">
<rect x="0" y="0" width="60" height="34" rx="4" class="soft"/><rect x="66" y="0" width="60" height="34" rx="4" class="soft"/><rect x="132" y="0" width="60" height="34" rx="4" class="soft"/><rect x="198" y="0" width="60" height="34" rx="4" class="soft"/><rect x="264" y="0" width="60" height="34" rx="4" class="soft"/><rect x="330" y="0" width="60" height="34" rx="4" class="soft"/><rect x="396" y="0" width="60" height="34" rx="4" class="soft"/><rect x="462" y="0" width="60" height="34" rx="4" class="soft"/><rect x="528" y="0" width="60" height="34" rx="4" class="soft"/><rect x="594" y="0" width="60" height="34" rx="4" class="soft"/>
<rect x="0" y="40" width="60" height="34" rx="4" class="soft"/><rect x="66" y="40" width="60" height="34" rx="4" class="soft"/><rect x="132" y="40" width="60" height="34" rx="4" class="soft"/><rect x="198" y="40" width="60" height="34" rx="4" class="soft"/><rect x="264" y="40" width="60" height="34" rx="4" class="soft"/><rect x="330" y="40" width="60" height="34" rx="4" class="soft"/><rect x="396" y="40" width="60" height="34" rx="4" class="soft"/><rect x="462" y="40" width="60" height="34" rx="4" class="soft"/><rect x="528" y="40" width="60" height="34" rx="4" class="soft"/><rect x="594" y="40" width="60" height="34" rx="4" class="soft"/>
<rect x="0" y="80" width="60" height="34" rx="4" class="soft"/><rect x="66" y="80" width="60" height="34" rx="4" class="soft"/><rect x="132" y="80" width="60" height="34" rx="4" class="soft"/><rect x="198" y="80" width="60" height="34" rx="4" class="soft"/><rect x="264" y="80" width="60" height="34" rx="4" class="hot"/><rect x="330" y="80" width="60" height="34" rx="4" class="hot"/><rect x="396" y="80" width="60" height="34" rx="4" class="hot"/><rect x="462" y="80" width="60" height="34" rx="4" class="soft"/><rect x="528" y="80" width="60" height="34" rx="4" class="soft"/><rect x="594" y="80" width="60" height="34" rx="4" class="soft"/>
<rect x="0" y="120" width="60" height="34" rx="4" class="soft"/><rect x="66" y="120" width="60" height="34" rx="4" class="soft"/><rect x="132" y="120" width="60" height="34" rx="4" class="soft"/><rect x="198" y="120" width="60" height="34" rx="4" class="soft"/><rect x="264" y="120" width="60" height="34" rx="4" class="soft"/><rect x="330" y="120" width="60" height="34" rx="4" class="soft"/><rect x="396" y="120" width="60" height="34" rx="4" class="soft"/><rect x="462" y="120" width="60" height="34" rx="4" class="soft"/><rect x="528" y="120" width="60" height="34" rx="4" class="soft"/><rect x="594" y="120" width="60" height="34" rx="4" class="soft"/>
<text x="0" y="182" class="lbl">where event_date = '2025-01-14'</text><text x="420" y="182" class="lbl">scanned 3 of 40 partitions</text>
</g>
</svg>
<figcaption>Good pruning. The data arrived in date order, so one day lives in a few partitions and the filter skips the rest.</figcaption>
</figure>

What helps it:

- Filter on the column the data naturally arrives in, usually a load date or event timestamp.
- Compare the raw column to a range. Wrapping it in a function can stop the pruning.
- Select only the columns you use. It's a columnar store; `select *` reads every column you didn't need.

```sql
-- reads more than it should
select *
from events
where to_char(event_ts, 'YYYY-MM-DD') = '2025-01-14'

-- prunes
select
  event_id
  , user_id
  , event_type
from events
where event_ts >= '2025-01-14'
  and event_ts < '2025-01-15'
```

If the table isn't in a useful order at all, a clustering key can fix that, but it costs credits to keep up. Try the filter first.

## 2. A join that explodes

You join two tables on a key that isn't unique on either side, and every match multiplies. Three orders and four shipments for the same customer is twelve rows, and then the `sum` downstream is wrong *and* slow.

<figure class="fig">
<svg viewBox="0 0 720 220" role="img" aria-labelledby="f3t">
<title id="f3t">Three order rows joined to four shipment rows on customer id produce twelve rows.</title>
<text x="0" y="20" class="lbl">orders (customer 42)</text>
<rect x="0" y="34" width="150" height="32" rx="5" class="box"/><text x="14" y="55">order 1</text>
<rect x="0" y="74" width="150" height="32" rx="5" class="box"/><text x="14" y="95">order 2</text>
<rect x="0" y="114" width="150" height="32" rx="5" class="box"/><text x="14" y="135">order 3</text>
<text x="230" y="20" class="lbl">shipments (customer 42)</text>
<rect x="230" y="34" width="150" height="32" rx="5" class="box"/><text x="244" y="55">shipment a</text>
<rect x="230" y="74" width="150" height="32" rx="5" class="box"/><text x="244" y="95">shipment b</text>
<rect x="230" y="114" width="150" height="32" rx="5" class="box"/><text x="244" y="135">shipment c</text>
<rect x="230" y="154" width="150" height="32" rx="5" class="box"/><text x="244" y="175">shipment d</text>
<path d="M150 50 L230 50 M150 50 L230 90 M150 50 L230 130 M150 50 L230 170 M150 90 L230 50 M150 90 L230 90 M150 90 L230 130 M150 90 L230 170 M150 130 L230 50 M150 130 L230 90 M150 130 L230 130 M150 130 L230 170" class="hot-line" opacity=".55"/>
<path d="M410 110 L470 110" class="line"/><path d="M462 104 L470 110 L462 116" class="line"/>
<text x="500" y="100" class="big">3 × 4 = 12 rows</text>
<text x="500" y="128" class="lbl">join output ≫ join input</text>
</svg>
<figcaption>The profile gives it away: the join puts out far more rows than went in.</figcaption>
</figure>

The fix is to get each side to the grain you want before you join: aggregate first, then join one row to one row.

```sql
with shipments_per_order as (
  select
    order_id
    , count(*) as shipment_count
    , max(shipped_at) as last_shipped_at
  from shipments
  group by
    order_id
)

select
  o.order_id
  , o.order_total
  , s.shipment_count
  , s.last_shipped_at
from orders as o
left outer join shipments_per_order as s
  on o.order_id = s.order_id
```

And put a `unique` test on the key you think is unique. In dbt it's two lines of YAML, and it catches this before anyone sees a doubled revenue number.

## 3. Spilling

When an aggregate or a sort doesn't fit in the warehouse's memory, it spills to local disk, and when that's full, to remote storage. Each step down is a lot slower. The profile shows it as **Bytes spilled to local storage** and **Bytes spilled to remote storage**.

<figure class="fig">
<svg viewBox="0 0 720 150" role="img" aria-labelledby="f4t">
<title id="f4t">Memory, then local disk, then remote storage: each step is slower.</title>
<rect x="0" y="30" width="190" height="70" rx="8" class="hot"/><text x="20" y="62" class="on-hot big">memory</text><text x="20" y="86" class="on-hot">fast</text>
<path d="M200 65 L255 65" class="line"/><path d="M247 59 L255 65 L247 71" class="line"/>
<rect x="265" y="30" width="190" height="70" rx="8" class="soft"/><text x="285" y="62" class="big">local disk</text><text x="285" y="86" class="lbl">spilled: slower</text>
<path d="M465 65 L520 65" class="dash"/><path d="M512 59 L520 65 L512 71" class="line"/>
<rect x="530" y="30" width="190" height="70" rx="8" class="box"/><text x="550" y="62" class="big">remote</text><text x="550" y="86" class="lbl">spilled again: slowest</text>
<text x="0" y="135" class="lbl">less data in (fixes 1 and 2) beats a bigger warehouse</text>
</svg>
<figcaption>Remote spilling is the one to worry about.</figcaption>
</figure>

Fix the first two before you reach for this, because less data going into the sort is the real cure. If it still spills, give that one model a bigger warehouse. Each size up doubles the credits per hour, but a query that stops spilling often finishes more than twice as fast, so it can cost less.

## 4. Doing the same work twice

The classic: "latest row per customer" as a self-join. The table gets read twice and joined to itself. Window functions do it in one pass, and Snowflake's `qualify` keeps it short.

```sql
-- reads orders twice
select
  o.customer_id
  , o.order_date
  , o.order_total
from orders as o
inner join (
  select
    customer_id
    , max(order_date) as last_order_date
  from orders
  group by
    customer_id
) as l
  on o.customer_id = l.customer_id
  and o.order_date = l.last_order_date

-- reads it once
select
  customer_id
  , order_date
  , order_total
from orders
qualify row_number() over (partition by customer_id order by order_date desc) = 1
```

Same idea for CTEs you reference three times and models that rebuild the whole table every hour when an incremental model would do.

## That's most of it

Read the profile, find the expensive node, match it to one of the four. If yours is none of them, [email me](mailto:steve@stevenpisani.com?subject=A%20fifth%20thing). I'd like to see it.
