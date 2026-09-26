-- FASE 2.0 Paso 2: defensa en profundidad sobre columnas Stripe legacy en companies.
-- No se borran columnas ni datos. No se modifican policies/RLS.
-- El nuevo Billing NO reutiliza estas columnas.
--
-- Nota: REVOKE SELECT (col...) sobre un GRANT ALL a nivel de tabla no elimina
-- el privilegio de columna en este proyecto (rol postgres no-superuser).
-- Equivalente efectivo: quitar ALL de anon/authenticated y devolver
-- privilegios de escritura de tabla + SELECT solo sobre columnas no-Stripe.

REVOKE ALL ON TABLE public.companies FROM anon;
REVOKE ALL ON TABLE public.companies FROM authenticated;

GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLE public.companies TO anon;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLE public.companies TO authenticated;

GRANT SELECT (
  id,
  name,
  created_at,
  created_by,
  join_code,
  cif,
  legal_representative,
  legal_representative_dni,
  address,
  city,
  province,
  postal_code,
  primary_admin_user_id,
  is_active,
  plan,
  plan_status,
  blocked,
  billing_notes,
  enable_shift_planning
) ON TABLE public.companies TO anon;

GRANT SELECT (
  id,
  name,
  created_at,
  created_by,
  join_code,
  cif,
  legal_representative,
  legal_representative_dni,
  address,
  city,
  province,
  postal_code,
  primary_admin_user_id,
  is_active,
  plan,
  plan_status,
  blocked,
  billing_notes,
  enable_shift_planning
) ON TABLE public.companies TO authenticated;
