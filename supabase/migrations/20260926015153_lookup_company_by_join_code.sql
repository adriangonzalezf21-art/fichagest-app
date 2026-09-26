-- FASE 2.0 Paso 1: RPC mínima para validar join_code sin exponer fila completa de companies.
-- La policy "public read company by join_code" se mantiene temporalmente (no se elimina aquí).

CREATE OR REPLACE FUNCTION public.lookup_company_by_join_code(p_code text)
RETURNS TABLE(id uuid, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text := upper(trim(coalesce(p_code, '')));
BEGIN
  IF length(v_code) < 4 OR length(v_code) > 12 THEN
    RETURN;
  END IF;

  IF v_code !~ '^[A-Z0-9]+$' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.id, c.name
  FROM public.companies c
  WHERE c.join_code IS NOT NULL
    AND upper(trim(c.join_code)) = v_code
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_company_by_join_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_company_by_join_code(text) TO anon, authenticated;
