---
layout: post
title:  "SQL Guide"
date:   2021-02-15T12:00:00+00:00
author: Steve
image_url: https://images.unsplash.com/photo-1520589884715-55ac7417f2ee?ixlib=rb-1.2.1&q=85&fm=jpg&crop=entropy&cs=srgb&w=1200
---

### Example
```sql
with hubspot_interest a
  select
    email
    , timestamp_millis(property_beacon_interest) as expressed_interest_at
  from hubspot.contact
  where property_beacon_interest is not null
)

, support_interest as (
  select
      con.email
      , con.created_at as expressed_interest_at
  from helpscout.conversation as con
  inner join helpscout.conversation_tag as tag
    on con.id = tag.conversation_id
  where tag.tag = 'beacon-interest'
) 

, combined_interest as (
    select * from hubspot_interest
    union all
    select * from support_interest
)

, final as (
  select 
    email
    , min(expressed_interest_at) as expressed_interest_at
  from combined_interest
  group by email
)

select
  email
  , expressed_interest_at
from final
```

---

# Rules

CONTEXT DECOUPLED UNDERSTANDABILITY!!

The goal of constant SQL formatting is to improve development, review, and understanding time.

## Capitalization

- *no capitalizing of keywords*

    keywords are already highlighted in the editor. the additional keystrokes are redundant.

## Aliasing & Naming

- *Always use* *`as`* *when aliasing columns*
- Use snake_case
- *Use* *`is_`* *prefix when naming boolean fields*
- *Alway rename aggregates and function fields*
- *If joins, alias all tables and include when addressing fields*
- *Use distinct aliases*
- *Use meaningful CTE names*

## Alignment

- *Left align new lines at their respective hierarchal level*
- For single conditions (`where`, `on`, `when`, etc.), leave on same line. For multiple, use new line

## Spacing

- *2 spaces for indents*

    easier to manually do. no super long lines due to front spacing

- S*tart columns below the* *`select`* *indented*

    Readability.

- Break long lists of `in` values into multiple lines
- A*lways end on new line*

    [unix expects all text files to end with \n](https://unix.stackexchange.com/questions/18743/whats-the-point-in-adding-a-new-line-to-the-end-of-a-file)

## Separators (`,` & `and`)

- *put em in front*

## Grouping

- *Grouping columns should go first in the* *`select`*
- *Group using column names or numbers but not both; prefer names to numbers*

## CTEs & Subqueries

- Use CTEs over subqueries