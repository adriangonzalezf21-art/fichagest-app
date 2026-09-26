-- FASE 2.0 Paso 3: autorización en duplicate_planned_week.
-- Conserva la lógica de duplicación; solo añade controles de auth/rol/empresa.

CREATE OR REPLACE FUNCTION public.duplicate_planned_week(
  p_company_id uuid,
  p_from_monday date,
  p_to_monday date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_is_owner boolean;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_company_id IS NULL OR p_from_monday IS NULL OR p_to_monday IS NULL THEN
    RAISE EXCEPTION 'Invalid arguments';
  END IF;

  SELECT p.company_id,
         coalesce(p.is_owner, false),
         lower(coalesce(p.role, ''))
    INTO v_company_id, v_is_owner, v_role
  FROM public.profiles p
  WHERE p.user_id = v_uid
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_is_owner IS TRUE THEN
    NULL; -- Owner autorizado para cualquier empresa
  ELSIF v_role = 'admin'
        AND v_company_id IS NOT NULL
        AND v_company_id = p_company_id THEN
    NULL; -- Admin solo su empresa
  ELSE
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.companies c WHERE c.id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  INSERT INTO public.planned_shifts (
    company_id,
    user_id,
    planned_date,
    start_time,
    end_time,
    break_minutes,
    notes,
    created_by
  )
  SELECT
    company_id,
    user_id,
    (p_to_monday + (planned_date - p_from_monday))::date,
    start_time,
    end_time,
    break_minutes,
    notes,
    created_by
  FROM public.planned_shifts
  WHERE company_id = p_company_id
    AND planned_date >= p_from_monday
    AND planned_date < (p_from_monday + interval '7 day');
END;
$$;
