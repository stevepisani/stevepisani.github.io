---
layout: post
title:  "SQL Guide"
date:   2021-02-15T12:00:00+00:00
author: Steve
image_url: https://images.unsplash.com/photo-1520589884715-55ac7417f2ee?ixlib=rb-1.2.1&q=85&fm=jpg&crop=entropy&cs=srgb&w=1200
---

When writing SQL, it is important to stay consistant to help anyone reading your queries (including _future_ you) quickly understand the logic in your code and pick out errors or opportunities for improvement. By sticking to a style guide, you can remove many of the headaches associated with reading, writing, and reviewing SQL in a team or by yourself. 

These suggestions are not written in stone and, if you have a suggestion or disagreement, I would love to chat about it.

### Example
```sql
  with date_spine as (
    select
      day
    from date_tables
  )

  , account_revenue as (
    select  
      account_id
      , created_date as joined_date
      , revenue
    from customers.revenue
    where revenue > 0
      and date(created_date) >= ( select min(created_at) from customers.groups )
  )

  select
    c.audience_id
    , d.day as date_of_interest
    , sum(ar.revenue) as daily_audience_revenue
  from customers.groups as c
  inner join date_spine as d
    on c.created_at <= d.day
  left outer join account_revenue as ar
    on c.account_id = r.account_id
  where c.created_at <= joined_date
  group by   
    c.audience_id
    , d.day
  order by
    c.audience_id
    , d.day
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