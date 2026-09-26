-- FASE 2.0 Paso 4: revocar EXECUTE de RPC legacy de creación de empresa.
-- No DROP: las funciones permanecen; solo se cierra acceso desde cliente.

REVOKE ALL ON FUNCTION public.create_company_simple(text, text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.create_company_and_be_admin(text)
  FROM PUBLIC, anon, authenticated;
