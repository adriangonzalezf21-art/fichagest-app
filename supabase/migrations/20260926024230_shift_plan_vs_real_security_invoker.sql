-- FASE 2.0 Paso 5: aplicar RLS del invocador a shift_plan_vs_real.
-- No recrea la vista; no cambia columnas, SQL interno, grants ni policies.

ALTER VIEW public.shift_plan_vs_real
SET (security_invoker = true);
