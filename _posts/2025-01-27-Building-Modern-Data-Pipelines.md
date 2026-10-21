---
layout: post
title: "Boring Data Pipelines Are the Good Kind"
date: 2025-01-27T10:00:00+00:00
description: "What I want from a pipeline: run it twice and nothing changes, it fails loudly and early, it's built for ten times today, and it never moves in one big bang."
---

In [Rockets and Horses](/2020/11/05/Rockets-and-Horses.html) I said design decisions propagate. Nothing propagates like a data pipeline. Every dashboard, model and Monday meeting downstream inherits whatever you decided on the way in.

So I want pipelines to be boring. Nobody thinks about a boring pipeline, the same way nobody thinks about a [style guide](/2021/02/15/SQL-Style-Guide.html) once a linter enforces it. Here's what boring takes.

## The shape

Most of what I build looks like this. The tools change; the shape doesn't.

<figure class="fig">
<svg viewBox="0 0 720 230" role="img" aria-labelledby="p1t">
<title id="p1t">Sources flow into a loader, then raw tables, staging models, marts, and dashboards, with tests under each layer.</title>
<text x="0" y="20" class="lbl">sources</text>
<rect x="0" y="30" width="120" height="34" rx="6" class="box"/><text x="12" y="52">app database</text>
<rect x="0" y="72" width="120" height="34" rx="6" class="box"/><text x="12" y="94">billing</text>
<rect x="0" y="114" width="120" height="34" rx="6" class="box"/><text x="12" y="136">CRM</text>
<path d="M120 47 L160 89 M120 89 L160 89 M120 131 L160 89" class="line"/>
<text x="160" y="20" class="lbl">load</text>
<rect x="160" y="72" width="100" height="34" rx="6" class="soft"/><text x="172" y="94">Fivetran</text>
<path d="M260 89 L290 89" class="line"/>
<text x="290" y="20" class="lbl">warehouse</text>
<rect x="290" y="72" width="80" height="34" rx="6" class="soft"/><text x="306" y="94">raw</text>
<path d="M370 89 L395 89" class="line"/>
<rect x="395" y="72" width="100" height="34" rx="6" class="soft"/><text x="410" y="94">staging</text>
<path d="M495 89 L520 89" class="line"/>
<rect x="520" y="72" width="80" height="34" rx="6" class="hot"/><text x="535" y="94" class="on-hot">marts</text>
<path d="M600 89 L625 89" class="line"/>
<rect x="625" y="72" width="95" height="34" rx="6" class="box"/><text x="637" y="94">dashboards</text>
<path d="M290 120 L600 120" class="dash"/>
<text x="290" y="145" class="lbl">dbt models, each one tested</text>
<path d="M160 180 L720 180" class="dash"/>
<text x="160" y="205" class="lbl">Airflow (or cron) runs it in order and pages someone when it breaks</text>
</svg>
<figcaption>Raw stays exactly as it arrived. Everything after it is code in git, so any layer can be rebuilt from the one before.</figcaption>
</figure>

## 1. Run it twice, get the same answer

If a job dies halfway and you rerun it, nothing should double. That's idempotency, and it's the rule I'd keep if I could only keep one, because every failure becomes "just run it again."

<figure class="fig">
<svg viewBox="0 0 720 210" role="img" aria-labelledby="p2t">
<title id="p2t">Appending the same batch twice doubles the rows. Merging on a key twice leaves the same rows.</title>
<text x="0" y="20" class="big">append</text><text x="120" y="20" class="lbl">run, then run again</text>
<rect x="0" y="36" width="300" height="28" rx="5" class="box"/><text x="12" y="55">order 1 · $40</text>
<rect x="0" y="70" width="300" height="28" rx="5" class="box"/><text x="12" y="89">order 2 · $25</text>
<rect x="0" y="104" width="300" height="28" rx="5" class="hot"/><text x="12" y="123" class="on-hot">order 1 · $40 (again)</text>
<rect x="0" y="138" width="300" height="28" rx="5" class="hot"/><text x="12" y="157" class="on-hot">order 2 · $25 (again)</text>
<text x="0" y="196" class="lbl">revenue: $130. it was $65.</text>
<text x="400" y="20" class="big">merge on order_id</text>
<rect x="400" y="36" width="300" height="28" rx="5" class="box"/><text x="412" y="55">order 1 · $40</text>
<rect x="400" y="70" width="300" height="28" rx="5" class="box"/><text x="412" y="89">order 2 · $25</text>
<text x="400" y="196" class="lbl">revenue: $65. run it all day.</text>
</svg>
<figcaption>Same batch, loaded twice.</figcaption>
</figure>

In dbt that's an incremental model with a `unique_key`, so a rerun updates rows instead of adding them:

```sql
{% raw %}{{ config(
  materialized = 'incremental'
  , unique_key = 'order_id'
  , incremental_strategy = 'merge'
) }}

select
  order_id
  , customer_id
  , order_total
  , updated_at
from {{ ref('stg_orders') }}
{% if is_incremental() %}
where updated_at > (select max(updated_at) from {{ this }})
{% endif %}{% endraw %}
```

## 2. Fail loud, and early

The worst pipeline isn't the one that breaks. It's the one that quietly loads wrong numbers that someone finds in a board deck three days later.

<figure class="fig">
<svg viewBox="0 0 720 170" role="img" aria-labelledby="p3t">
<title id="p3t">A bad row arrives Monday. With a test, the pipeline stops Monday morning. Without one, someone finds it Thursday.</title>
<path d="M0 60 L720 60" class="line"/>
<circle cx="40" cy="60" r="7" class="hot"/><text x="0" y="36" class="lbl">Mon 6:00</text><text x="0" y="90">bad row lands</text>
<circle cx="200" cy="60" r="7" class="hot"/><text x="160" y="36" class="lbl">Mon 6:05</text><text x="160" y="90">test fails, run stops</text><text x="160" y="110" class="lbl">nobody downstream sees it</text>
<circle cx="640" cy="60" r="7" class="soft"/><text x="560" y="36" class="lbl">Thu 2:00</text><text x="560" y="90">"why is revenue</text><text x="560" y="110">doubled?"</text>
<path d="M200 130 L640 130" class="dash"/><text x="330" y="155" class="lbl">three days of wrong numbers, without the test</text>
</svg>
<figcaption>A test is cheap. Three days of a wrong number isn't.</figcaption>
</figure>

The tests that catch most of it are the boring ones:

```yaml
models:
  - name: orders
    columns:
      - name: order_id
        tests: [unique, not_null]
      - name: customer_id
        tests:
          - relationships:
              to: ref('customers')
              field: customer_id
      - name: status
        tests:
          - accepted_values:
              values: ['placed', 'shipped', 'returned']
```

Make the error say what broke and where. "Test failed" at 6 a.m. is a puzzle. "orders.order_id is not unique: 14 duplicates" is a fix.

## 3. Build for ten times today, not a thousand

Plan for the next order of magnitude. Past that you're building for a company you aren't yet, and paying for it in complexity every day until then.

<figure class="fig">
<svg viewBox="0 0 720 180" role="img" aria-labelledby="p4t">
<title id="p4t">On a log scale: today, ten times today, which is what to plan for, and a thousand times today, which isn't.</title>
<text x="0" y="40">today</text><rect x="140" y="24" width="160" height="26" rx="5" class="soft"/>
<text x="0" y="90">10×</text><rect x="140" y="74" width="320" height="26" rx="5" class="hot"/><text x="472" y="93">plan for this</text>
<text x="0" y="140">1,000×</text><rect x="140" y="124" width="580" height="26" rx="5" class="box"/><text x="152" y="143" class="lbl">only if you're actually Google</text>
<text x="140" y="172" class="lbl">log scale: each step right is ten times the one before</text>
</svg>
<figcaption>A warehouse plus a scheduler covers a lot more than people expect.</figcaption>
</figure>

## 4. Never move in one big bang

When you replace a pipeline, run the old one and the new one side by side and compare them until the differences are zero, or explained. Then switch. The comparison is a query you can leave running:

```sql
select
  'only in old' as side
  , count(*) as row_count
from (
  select * from old_marts.orders
  except
  select * from new_marts.orders
)

union all

select
  'only in new' as side
  , count(*) as row_count
from (
  select * from new_marts.orders
  except
  select * from old_marts.orders
)
```

Two zeros and you can turn the old one off.

## Boring is the goal

None of this is clever. That's the point. A pipeline that's safe to rerun, stops at the first bad row, fits the next couple of years and changed gradually is one nobody has to think about, which leaves time for the work people actually notice.
