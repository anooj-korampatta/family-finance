# Family Finance — V1 frontend

## Current behaviour
- Income and expense transactions
- Balance = income - expenses
- Default categories appear immediately
- Category selection works without Supabase
- Skeleton loading is removed from the normal page
- Data persists in localStorage during frontend testing
- Income source options: Salary, Allowance, Transfer, Other
- Editable transaction dates
- Responsive Bootstrap UI

## Important
The previous starter imported `config.js` before it existed. That caused the JavaScript module to fail, which is why categories did not populate and the skeleton remained visible. This version removes that dependency until Supabase is actually connected.

## Supabase phase
We will later replace the localStorage persistence with Supabase PostgreSQL + Realtime and add RLS.
