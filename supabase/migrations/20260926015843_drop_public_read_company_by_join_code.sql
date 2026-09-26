-- FASE 2.0: cerrar lectura pública de companies por join_code.
-- La validación pública queda solo vía lookup_company_by_join_code (id, name).

DROP POLICY IF EXISTS "public read company by join_code"
ON public.companies;
