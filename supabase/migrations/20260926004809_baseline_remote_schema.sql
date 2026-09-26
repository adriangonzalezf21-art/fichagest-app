-- Baseline schema dump (schema-only) of remote Supabase project fichajes-saas
-- project_ref: cshpwqizqqhemjlqrcnb
-- generated_at_utc: 2026-09-26 (filename timestamp 20260926004809)
-- source: remote read-only pg_dump --schema-only --schema=public --role=postgres
-- NOTE: Photograph for versioning/rollback. Remote was NOT modified.

--
-- PostgreSQL database dump
--

\restrict ILUGw6h4IQjoO4yLvUVq12rBthg3W5cZNISCQSSFNayHY1ZFlMbtNbcyVSoXphc

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: vacation_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."vacation_status" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CANCELED'
);


ALTER TYPE "public"."vacation_status" OWNER TO "postgres";

--
-- Name: _caller_profile(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."_caller_profile"() RETURNS TABLE("caller_user_id" "uuid", "caller_company_id" "uuid", "caller_is_owner" boolean, "caller_is_admin" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select
    p.user_id as caller_user_id,
    p.company_id as caller_company_id,
    coalesce(p.is_owner,false) as caller_is_owner,
    (coalesce(p.is_owner,false) = true) or (lower(coalesce(p.role,'')) = 'admin') as caller_is_admin
  from public.profiles p
  where p.user_id = auth.uid()
  limit 1;
$$;


ALTER FUNCTION "public"."_caller_profile"() OWNER TO "postgres";

--
-- Name: admin_decide_vacation_request("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."admin_decide_vacation_request"("p_request_id" "uuid", "p_status" "text", "p_admin_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_admin_id uuid;
  v_admin_company uuid;
  v_admin_role text;
  v_admin_is_owner boolean;

  v_req_company uuid;
begin
  v_admin_id := auth.uid();
  if v_admin_id is null then
    raise exception 'No authenticated user';
  end if;

  -- validar status
  if upper(p_status) not in ('APPROVED','REJECTED') then
    raise exception 'Invalid status: %', p_status;
  end if;

  -- leer admin (quién llama)
  select company_id, role, coalesce(is_owner,false)
    into v_admin_company, v_admin_role, v_admin_is_owner
  from public.profiles
  where user_id = v_admin_id;

  if v_admin_company is null then
    raise exception 'Admin user has no company_id';
  end if;

  if not (v_admin_is_owner = true or lower(coalesce(v_admin_role,'')) = 'admin') then
    raise exception 'Not allowed: admin role required';
  end if;

  -- leer company del request
  select company_id
    into v_req_company
  from public.vacation_requests
  where id = p_request_id;

  if v_req_company is null then
    raise exception 'Vacation request not found';
  end if;

  if v_req_company <> v_admin_company then
    raise exception 'Not allowed: different company';
  end if;

  -- aplicar decisión (solo si sigue pendiente)
  update public.vacation_requests
  set
    status = upper(p_status),
    admin_note = nullif(trim(p_admin_note), ''),
    decided_at = now()
  where id = p_request_id
    and status = 'PENDING';

  if not found then
    raise exception 'Request is not PENDING (or not found)';
  end if;
end;
$$;


ALTER FUNCTION "public"."admin_decide_vacation_request"("p_request_id" "uuid", "p_status" "text", "p_admin_note" "text") OWNER TO "postgres";

--
-- Name: admin_delete_user("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."admin_delete_user"("target_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  caller record;
  target record;
begin
  select * into caller from public._caller_profile();

  if caller.caller_user_id is null then
    raise exception 'No session / no caller profile';
  end if;

  if caller.caller_is_owner is distinct from true then
    raise exception 'Only OWNER can delete users';
  end if;

  select user_id, company_id, is_owner into target
  from public.profiles
  where user_id = target_user_id
  limit 1;

  if target.user_id is null then
    raise exception 'Target user not found';
  end if;

  if target.company_id is distinct from caller.caller_company_id then
    raise exception 'Target user is not in your company';
  end if;

  if coalesce(target.is_owner,false) = true then
    raise exception 'Cannot delete OWNER';
  end if;

  if target_user_id = caller.caller_user_id then
    raise exception 'Cannot delete yourself';
  end if;

  delete from public.profiles
  where user_id = target_user_id;
end;
$$;


ALTER FUNCTION "public"."admin_delete_user"("target_user_id" "uuid") OWNER TO "postgres";

--
-- Name: admin_set_user_active("uuid", boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."admin_set_user_active"("target_user_id" "uuid", "new_active" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  caller record;
  target record;
  target_is_admin boolean;
begin
  select * into caller from public._caller_profile();

  if caller.caller_user_id is null then
    raise exception 'No session / no caller profile';
  end if;

  if caller.caller_is_admin is distinct from true then
    raise exception 'Only ADMIN/OWNER can activate/deactivate users';
  end if;

  select user_id, company_id, is_owner, role into target
  from public.profiles
  where user_id = target_user_id
  limit 1;

  if target.user_id is null then
    raise exception 'Target user not found';
  end if;

  if target.company_id is distinct from caller.caller_company_id then
    raise exception 'Target user is not in your company';
  end if;

  if coalesce(target.is_owner,false) = true then
    raise exception 'Cannot deactivate OWNER';
  end if;

  if target_user_id = caller.caller_user_id then
    raise exception 'Cannot deactivate yourself';
  end if;

  target_is_admin := (lower(coalesce(target.role,'')) = 'admin');

  -- Admin secundario no puede tocar admins
  if caller.caller_is_owner is distinct from true and target_is_admin = true then
    raise exception 'Secondary ADMIN cannot activate/deactivate other ADMINs';
  end if;

  update public.profiles
  set active = new_active
  where user_id = target_user_id;
end;
$$;


ALTER FUNCTION "public"."admin_set_user_active"("target_user_id" "uuid", "new_active" boolean) OWNER TO "postgres";

--
-- Name: admin_set_user_role("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."admin_set_user_role"("target_user_id" "uuid", "new_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
declare
  caller record;
  target record;
begin
  select * into caller from public._caller_profile();

  if caller.caller_user_id is null then
    raise exception 'No session / no caller profile';
  end if;

  if caller.caller_is_owner is distinct from true then
    raise exception 'Only OWNER can change roles';
  end if;

  if lower(coalesce(new_role,'')) not in ('admin','worker') then
    raise exception 'Invalid role: %', new_role;
  end if;

  select user_id, company_id, is_owner into target
  from public.profiles
  where user_id = target_user_id
  limit 1;

  if target.user_id is null then
    raise exception 'Target user not found';
  end if;

  if target.company_id is distinct from caller.caller_company_id then
    raise exception 'Target user is not in your company';
  end if;

  if coalesce(target.is_owner,false) = true then
    raise exception 'Cannot modify OWNER';
  end if;

  if target_user_id = caller.caller_user_id then
    raise exception 'Cannot change your own role';
  end if;

  update public.profiles
  set role = lower(new_role)
  where user_id = target_user_id;
end;
$$;


ALTER FUNCTION "public"."admin_set_user_role"("target_user_id" "uuid", "new_role" "text") OWNER TO "postgres";

--
-- Name: calc_days_natural("date", "date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."calc_days_natural"("p_start" "date", "p_end" "date") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select (p_end - p_start + 1)::numeric;
$$;


ALTER FUNCTION "public"."calc_days_natural"("p_start" "date", "p_end" "date") OWNER TO "postgres";

--
-- Name: change_primary_admin("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."change_primary_admin"("p_company_id" "uuid", "p_new_admin_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_me uuid;
  v_is_owner boolean;
begin
  v_me := auth.uid();

  if v_me is null then
    raise exception 'No autenticado';
  end if;

  select coalesce(is_owner, false)
    into v_is_owner
  from public.profiles
  where user_id = v_me;

  if coalesce(v_is_owner, false) is not true then
    raise exception 'Solo el owner puede cambiar el admin principal';
  end if;

  if p_company_id is null then
    raise exception 'Falta company_id';
  end if;

  if p_new_admin_user_id is null then
    raise exception 'Falta nuevo admin';
  end if;

  if not exists (
    select 1
    from public.companies
    where id = p_company_id
  ) then
    raise exception 'La empresa no existe';
  end if;

  if not exists (
    select 1
    from public.profiles
    where user_id = p_new_admin_user_id
      and company_id = p_company_id
      and coalesce(active, true) = true
  ) then
    raise exception 'El nuevo admin debe pertenecer a la empresa y estar activo';
  end if;

  update public.profiles
  set role = 'admin'
  where user_id = p_new_admin_user_id
    and company_id = p_company_id;

  update public.companies
  set primary_admin_user_id = p_new_admin_user_id
  where id = p_company_id;
end;
$$;


ALTER FUNCTION "public"."change_primary_admin"("p_company_id" "uuid", "p_new_admin_user_id" "uuid") OWNER TO "postgres";

--
-- Name: create_company_and_assign_admin("text", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."create_company_and_assign_admin"("p_name" "text", "p_cif" "text", "p_admin_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_me_owner boolean;
  v_company_id uuid;
  v_join_code text;
begin
  select coalesce(is_owner, false)
    into v_me_owner
  from public.profiles
  where user_id = auth.uid();

  if coalesce(v_me_owner, false) is not true then
    raise exception 'No autorizado';
  end if;

  v_join_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.companies (
    name,
    cif,
    join_code,
    created_by,
    primary_admin_user_id
  )
  values (
    trim(p_name),
    nullif(trim(p_cif), ''),
    v_join_code,
    auth.uid(),
    p_admin_user_id
  )
  returning id into v_company_id;

  update public.profiles
  set
    company_id = v_company_id,
    role = 'admin',
    active = true
  where user_id = p_admin_user_id;

  if not found then
    raise exception 'No existe el perfil del admin';
  end if;

  return v_company_id;
end;
$$;


ALTER FUNCTION "public"."create_company_and_assign_admin"("p_name" "text", "p_cif" "text", "p_admin_user_id" "uuid") OWNER TO "postgres";

--
-- Name: create_company_and_be_admin("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."create_company_and_be_admin"("p_company_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  cid uuid;
  code text;
begin
  if p_company_name is null or length(trim(p_company_name)) = 0 then
    raise exception 'Nombre de empresa obligatorio';
  end if;

  -- genera join_code (8 chars)
  code := substr(md5(random()::text), 1, 8);

  insert into public.companies (name, join_code)
  values (trim(p_company_name), code)
  returning id into cid;

  update public.profiles
  set company_id = cid,
      role = 'admin'
  where user_id = auth.uid();

  return cid;
end;
$$;


ALTER FUNCTION "public"."create_company_and_be_admin"("p_company_name" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: companies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "join_code" "text",
    "cif" "text",
    "legal_representative" "text",
    "legal_representative_dni" "text",
    "address" "text",
    "city" "text",
    "province" "text",
    "postal_code" "text",
    "primary_admin_user_id" "uuid",
    "is_active" boolean DEFAULT true,
    "plan" "text" DEFAULT 'free'::"text",
    "plan_status" "text" DEFAULT 'inactive'::"text",
    "blocked" boolean DEFAULT false,
    "billing_notes" "text",
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "enable_shift_planning" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."companies" OWNER TO "postgres";

--
-- Name: create_company_simple("text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."create_company_simple"("p_name" "text", "p_cif" "text") RETURNS "public"."companies"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  new_company companies;
  new_code text;
begin
  -- generar código
  new_code := upper(substring(md5(random()::text) from 1 for 8));

  insert into companies (name, cif, join_code)
  values (p_name, p_cif, new_code)
  returning * into new_company;

  return new_company;
end;
$$;


ALTER FUNCTION "public"."create_company_simple"("p_name" "text", "p_cif" "text") OWNER TO "postgres";

--
-- Name: create_vacation_request("date", "date", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."create_vacation_request"("p_start" "date", "p_end" "date", "p_note" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_days numeric;
  v_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'No authenticated user';
  end if;

  if p_start is null or p_end is null then
    raise exception 'start_date and end_date are required';
  end if;

  if p_end < p_start then
    raise exception 'end_date cannot be before start_date';
  end if;

  -- company_id desde profiles (multempresa por usuario)
  select company_id into v_company_id
  from public.profiles
  where user_id = v_user_id;

  if v_company_id is null then
    raise exception 'User has no company_id';
  end if;

  -- días naturales: diferencia + 1
  v_days := (p_end - p_start) + 1;

  insert into public.vacation_requests (
    user_id,
    company_id,
    start_date,
    end_date,
    days,
    status,
    note
  )
  values (
    v_user_id,
    v_company_id,
    p_start,
    p_end,
    v_days,
    'PENDING',
    nullif(trim(p_note), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."create_vacation_request"("p_start" "date", "p_end" "date", "p_note" "text") OWNER TO "postgres";

--
-- Name: current_company_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."current_company_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select company_id
  from public.profiles
  where user_id = auth.uid()
  limit 1
$$;


ALTER FUNCTION "public"."current_company_id"() OWNER TO "postgres";

--
-- Name: current_role(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."current_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select role
  from public.profiles
  where user_id = auth.uid()
  limit 1
$$;


ALTER FUNCTION "public"."current_role"() OWNER TO "postgres";

--
-- Name: current_user_company_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."current_user_company_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select p.company_id
  from public.profiles p
  where p.user_id = auth.uid()
  limit 1;
$$;


ALTER FUNCTION "public"."current_user_company_id"() OWNER TO "postgres";

--
-- Name: decide_vacation_request("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."decide_vacation_request"("p_request_id" "uuid", "p_decision" "text", "p_admin_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_uid uuid;
  v_company uuid;
  v_is_admin boolean;
  v_req record;
  v_year int;
  v_taken numeric;
  v_entitled numeric;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select company_id, ((lower(role)='admin') or (is_owner=true)) into v_company, v_is_admin
  from public.profiles
  where user_id = v_uid;

  if v_company is null or v_is_admin is not true then
    raise exception 'Not allowed';
  end if;

  if p_decision not in ('APPROVED','REJECTED') then
    raise exception 'Invalid decision';
  end if;

  select * into v_req
  from public.vacation_requests
  where id = p_request_id and company_id = v_company
  for update;

  if not found then
    raise exception 'Request not found';
  end if;

  if v_req.status <> 'PENDING' then
    raise exception 'Only PENDING can be decided';
  end if;

  -- Si aprueba: validar saldo (mismo año del start_date)
  if p_decision = 'APPROVED' then
    v_year := extract(year from v_req.start_date)::int;

    -- crear balance si no existe (default 30)
    insert into public.vacation_balances(company_id, user_id, year, entitled_days, carried_over_days)
    values (v_company, v_req.user_id, v_year, 30, 0)
    on conflict (company_id, user_id, year) do nothing;

    -- consumido aprobado en ese año
    select coalesce(sum(days),0) into v_taken
    from public.vacation_requests
    where company_id = v_company
      and user_id = v_req.user_id
      and status = 'APPROVED'
      and extract(year from start_date)::int = v_year;

    select (entitled_days + carried_over_days) into v_entitled
    from public.vacation_balances
    where company_id = v_company and user_id = v_req.user_id and year = v_year;

    if (v_taken + v_req.days) > v_entitled then
      raise exception 'Saldo insuficiente: intentas aprobar % días pero quedan %',
        v_req.days, (v_entitled - v_taken);
    end if;
  end if;

  update public.vacation_requests
  set status = p_decision,
      admin_note = p_admin_note,
      decided_by = v_uid,
      decided_at = now()
  where id = p_request_id;

end;
$$;


ALTER FUNCTION "public"."decide_vacation_request"("p_request_id" "uuid", "p_decision" "text", "p_admin_note" "text") OWNER TO "postgres";

--
-- Name: duplicate_planned_week("uuid", "date", "date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."duplicate_planned_week"("p_company_id" "uuid", "p_from_monday" "date", "p_to_monday" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin

  insert into planned_shifts (
    company_id,
    user_id,
    planned_date,
    start_time,
    end_time,
    break_minutes,
    notes,
    created_by
  )
  select
    company_id,
    user_id,
    (p_to_monday + (planned_date - p_from_monday))::date,
    start_time,
    end_time,
    break_minutes,
    notes,
    created_by
  from planned_shifts
  where company_id = p_company_id
    and planned_date >= p_from_monday
    and planned_date < p_from_monday + interval '7 day';

end;
$$;


ALTER FUNCTION "public"."duplicate_planned_week"("p_company_id" "uuid", "p_from_monday" "date", "p_to_monday" "date") OWNER TO "postgres";

--
-- Name: enforce_single_owner_per_company(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."enforce_single_owner_per_company"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  owner_count integer;
begin
  -- Solo comprobamos si el nuevo valor será TRUE
  if new.is_owner = true then

    select count(*)
    into owner_count
    from public.profiles p
    where p.company_id = new.company_id
      and p.is_owner = true
      and p.user_id <> new.user_id;

    if owner_count > 0 then
      raise exception 'Ya existe un OWNER en esta empresa.';
    end if;

    -- Forzar coherencia
    new.role := 'admin';
    new.active := true;

  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_single_owner_per_company"() OWNER TO "postgres";

--
-- Name: gen_join_code(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."gen_join_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  out text := '';
  i int;
begin
  for i in 1..6 loop
    out := out || substr(chars, (floor(random() * length(chars)) + 1)::int, 1);
  end loop;
  return out;
end;
$$;


ALTER FUNCTION "public"."gen_join_code"() OWNER TO "postgres";

--
-- Name: gen_join_code(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."gen_join_code"("len" integer DEFAULT 6) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  code text;
begin
  loop
    -- hex upper y recortamos
    code := upper(substr(encode(gen_random_bytes(16), 'hex'), 1, len));
    exit when not exists (select 1 from public.companies c where c.join_code = code);
  end loop;
  return code;
end;
$$;


ALTER FUNCTION "public"."gen_join_code"("len" integer) OWNER TO "postgres";

--
-- Name: get_dashboard_calendar_days("date", "date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_dashboard_calendar_days"("p_from" "date", "p_to" "date") RETURNS TABLE("day" "date", "shifts_total" bigint, "vacations_total" bigint, "vacations_pending" bigint, "shift_names" "text"[], "vacation_names" "text"[])
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
with me as (
  select company_id
  from profiles
  where user_id = auth.uid()
  limit 1
),

days as (
  select generate_series(p_from, p_to, interval '1 day')::date as d
),

shift_data as (
  select
    s.started_at::date as d,
    count(*) as shifts_total,
    array_remove(array_agg(distinct coalesce(p.full_name, u.email)), null) as shift_names
  from shifts s
  join profiles p on p.user_id = s.user_id
  join me on me.company_id = p.company_id
  left join auth.users u on u.id = s.user_id
  where s.started_at::date between p_from and p_to
  group by s.started_at::date
),

vac_data as (
  select
    gs::date as d,
    count(*) filter (where vc.status = 'APPROVED') as vacations_total,
    count(*) filter (where vc.status = 'PENDING') as vacations_pending,
    array_remove(
      array_agg(
        distinct case
          when vc.status = 'APPROVED'
          then coalesce(p.full_name, u.email)
        end
      ),
      null
    ) as vacation_names
  from vacation_calendar vc
  join profiles p on p.user_id = vc.user_id
  join me on me.company_id = p.company_id
  join generate_series(vc.start_date, vc.end_date, interval '1 day') gs on true
  left join auth.users u on u.id = vc.user_id
  where gs::date between p_from and p_to
  group by gs::date
)

select
  d.d as day,
  coalesce(sd.shifts_total, 0) as shifts_total,
  coalesce(vd.vacations_total, 0) as vacations_total,
  coalesce(vd.vacations_pending, 0) as vacations_pending,
  coalesce(sd.shift_names, '{}') as shift_names,
  coalesce(vd.vacation_names, '{}') as vacation_names
from days d
left join shift_data sd on sd.d = d.d
left join vac_data vd on vd.d = d.d
order by d.d;
$$;


ALTER FUNCTION "public"."get_dashboard_calendar_days"("p_from" "date", "p_to" "date") OWNER TO "postgres";

--
-- Name: get_dashboard_metrics(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_dashboard_metrics"() RETURNS TABLE("week_hours" "text", "month_hours" "text", "month_shifts" integer, "open_shifts" integer, "open_shifts_over_10h" integer, "pending_vac_company" integer, "my_pending_vac" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_role text;
  v_is_admin boolean;
  v_week_start timestamptz;
  v_month_start timestamptz;
  v_month_end timestamptz;
begin
  if v_uid is null then
    raise exception 'No auth.uid()';
  end if;

  select company_id, lower(coalesce(role,'worker'))
    into v_company_id, v_role
  from profiles
  where user_id = v_uid;

  v_is_admin := (v_role = 'admin');

  -- semana: lunes 00:00
  v_week_start := date_trunc('week', now());
  -- mes
  v_month_start := date_trunc('month', now());
  v_month_end := (date_trunc('month', now()) + interval '1 month');

  -- -------------------------------------------------
  -- Horas netas semana y mes:
  -- Por rendimiento: calculo neto por shift usando time_entries
  -- (IN/OUT y BREAK_START/BREAK_END igual que tu lógica)
  -- -------------------------------------------------

  return query
  with scope_shifts as (
    select s.id, s.user_id, s.started_at, s.ended_at
    from shifts s
    where
      (
        (v_is_admin and v_company_id is not null and exists (
          select 1 from profiles p where p.user_id = s.user_id and p.company_id = v_company_id
        ))
        or
        (not v_is_admin and s.user_id = v_uid)
      )
  ),
  te as (
    select t.shift_id, t.entry_type, t.ts
    from time_entries t
    join scope_shifts s on s.id = t.shift_id
  ),
  -- netSeconds por shift: lo calculamos con ventanas
  -- Simplificación: asumimos datos consistentes (IN ... OUT) y pausas entre medias
  pairs as (
    select
      shift_id,
      entry_type,
      ts,
      lead(entry_type) over (partition by shift_id order by ts) as next_type,
      lead(ts) over (partition by shift_id order by ts) as next_ts
    from te
  ),
  gross as (
    -- IN -> OUT (duración gross)
    select shift_id, sum(extract(epoch from (next_ts - ts)))::bigint as gross_seconds
    from pairs
    where entry_type = 'IN' and next_type in ('OUT')
    group by shift_id
  ),
  breaks as (
    -- BREAK_START -> BREAK_END (duración pausa)
    select shift_id, sum(extract(epoch from (next_ts - ts)))::bigint as break_seconds
    from pairs
    where entry_type = 'BREAK_START' and next_type in ('BREAK_END')
    group by shift_id
  ),
  net_by_shift as (
    select
      s.id as shift_id,
      s.started_at,
      s.ended_at,
      greatest(coalesce(g.gross_seconds,0) - coalesce(b.break_seconds,0),0)::bigint as net_seconds
    from scope_shifts s
    left join gross g on g.shift_id = s.id
    left join breaks b on b.shift_id = s.id
  ),
  net_week as (
    select sum(net_seconds)::bigint as sec
    from net_by_shift
    where ended_at is not null
      and started_at >= v_week_start
      and started_at < (v_week_start + interval '7 days')
  ),
  net_month as (
    select sum(net_seconds)::bigint as sec
    from net_by_shift
    where ended_at is not null
      and started_at >= v_month_start
      and started_at < v_month_end
  ),
  shifts_month as (
    select count(*)::int as c
    from scope_shifts
    where started_at >= v_month_start
      and started_at < v_month_end
  ),
  open_shifts as (
    select count(*)::int as c
    from scope_shifts
    where ended_at is null
  ),
  open_over_10h as (
    select count(*)::int as c
    from scope_shifts
    where ended_at is null
      and now() - started_at > interval '10 hours'
  ),
  vac_my_pending as (
    select count(*)::int as c
    from vacation_requests vr
    where vr.user_id = v_uid
      and vr.status = 'PENDING'
  ),
  vac_company_pending as (
    select count(*)::int as c
    from vacation_requests vr
    where v_is_admin
      and exists (
        select 1 from profiles p
        where p.user_id = vr.user_id
          and p.company_id = v_company_id
      )
      and vr.status = 'PENDING'
  )
  select
    public.hhmm_from_seconds(coalesce((select sec from net_week),0)),
    public.hhmm_from_seconds(coalesce((select sec from net_month),0)),
    coalesce((select c from shifts_month),0),
    coalesce((select c from open_shifts),0),
    coalesce((select c from open_over_10h),0),
    coalesce((select c from vac_company_pending),0),
    coalesce((select c from vac_my_pending),0);

end;
$$;


ALTER FUNCTION "public"."get_dashboard_metrics"() OWNER TO "postgres";

--
-- Name: get_dashboard_metrics_v2(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_dashboard_metrics_v2"() RETURNS TABLE("month_hours" "text", "month_shifts" integer, "open_shifts" integer, "pending_vacations" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_month_start timestamptz := date_trunc('month', now());
  v_month_end   timestamptz := (date_trunc('month', now()) + interval '1 month');
begin
  -- company del usuario
  select p.company_id into v_company
  from public.profiles p
  where p.user_id = v_uid;

  -- Si no hay empresa, devolvemos ceros
  if v_company is null then
    month_hours := '00:00';
    month_shifts := 0;
    open_shifts := 0;
    pending_vacations := 0;
    return next;
    return;
  end if;

  -- Turnos en curso (empresa)
  select count(*) into open_shifts
  from public.shifts s
  join public.profiles p on p.user_id = s.user_id
  where p.company_id = v_company
    and s.ended_at is null;

  -- Turnos del mes (empresa) - cuentan abiertos y cerrados
  select count(*) into month_shifts
  from public.shifts s
  join public.profiles p on p.user_id = s.user_id
  where p.company_id = v_company
    and s.started_at >= v_month_start
    and s.started_at < v_month_end;

  -- Horas netas del mes (empresa), calculadas a partir de time_entries
  -- (sumamos IN->OUT y restamos pausas; si no hay OUT, ignoramos ese tramo en "neto mes" para no inflar)
  with e as (
    select
      s.id as shift_id,
      s.user_id,
      te.entry_type,
      te.ts
    from public.shifts s
    join public.profiles p on p.user_id = s.user_id
    join public.time_entries te on te.shift_id = s.id
    where p.company_id = v_company
      and s.started_at >= v_month_start
      and s.started_at < v_month_end
    order by te.shift_id, te.ts
  ),
  per_shift as (
    select
      shift_id,
      sum(case when entry_type = 'OUT'
               then extract(epoch from (ts - lag(ts) over (partition by shift_id order by ts)))
               else 0 end) as gross_seconds
    from (
      select
        shift_id,
        entry_type,
        ts
      from e
    ) x
    -- OJO: este "gross" aquí no es fiable sin lógica de pares IN/OUT.
    -- Para no complicarlo en SQL, usamos enfoque más robusto:
  ),
  pairs as (
    -- Capturamos pares IN->OUT por orden, ignorando lo que no esté pareado correctamente.
    select
      shift_id,
      ts as in_ts,
      lead(ts) over (partition by shift_id order by ts) as next_ts,
      lead(entry_type) over (partition by shift_id order by ts) as next_type
    from e
    where entry_type in ('IN','OUT','BREAK_START','BREAK_END')
  ),
  work_blocks as (
    -- Bloques de trabajo: IN->OUT
    select
      shift_id,
      extract(epoch from (next_ts - in_ts)) as seconds
    from pairs
    where next_ts is not null
      and entry_type = 'IN'
      and next_type = 'OUT'
  ),
  break_blocks as (
    -- Bloques de pausa: BREAK_START->BREAK_END
    select
      shift_id,
      extract(epoch from (next_ts - in_ts)) as seconds
    from pairs
    where next_ts is not null
      and entry_type = 'BREAK_START'
      and next_type = 'BREAK_END'
  ),
  net as (
    select
      coalesce((select sum(seconds) from work_blocks),0) - coalesce((select sum(seconds) from break_blocks),0) as net_seconds
  )
  select
    lpad((floor(net_seconds/3600))::int::text, 2, '0')
    || ':' ||
    lpad((floor(mod(net_seconds,3600)/60))::int::text, 2, '0')
  into month_hours
  from net;

  if month_hours is null then
    month_hours := '00:00';
  end if;

  -- Vacaciones pendientes:
  -- si es admin -> cuenta todas las PENDING de la empresa
  -- si es worker -> cuenta solo las suyas
  if lower(coalesce((select role from public.profiles where user_id = v_uid), 'worker')) = 'admin' then
    select count(*) into pending_vacations
    from public.vacation_requests vr
    join public.profiles p on p.user_id = vr.user_id
    where p.company_id = v_company
      and vr.status = 'PENDING';
  else
    select count(*) into pending_vacations
    from public.vacation_requests vr
    where vr.user_id = v_uid
      and vr.status = 'PENDING';
  end if;

  return next;
end;
$$;


ALTER FUNCTION "public"."get_dashboard_metrics_v2"() OWNER TO "postgres";

--
-- Name: get_my_company_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_my_company_id"() RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select company_id
  from public.profiles
  where user_id = auth.uid()
  limit 1
$$;


ALTER FUNCTION "public"."get_my_company_id"() OWNER TO "postgres";

--
-- Name: handle_new_auth_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_join_code text;
  v_full_name text;
  v_dni text;
  v_company_id uuid;
begin
  -- Lee metadata enviada desde signUp
  v_join_code := coalesce(new.raw_user_meta_data->>'join_code', '');
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', '');
  v_dni := coalesce(new.raw_user_meta_data->>'dni', '');

  -- Si viene join_code, buscamos empresa
  if v_join_code <> '' then
    select id into v_company_id
    from public.companies
    where join_code = v_join_code
    limit 1;
  end if;

  -- Crea/actualiza profile
  insert into public.profiles (user_id, company_id, role, full_name, dni, active, is_owner)
  values (new.id, v_company_id, 'worker', nullif(v_full_name,''), nullif(v_dni,''), true, false)
  on conflict (user_id) do update
    set company_id = excluded.company_id,
        role       = excluded.role,
        full_name  = coalesce(excluded.full_name, public.profiles.full_name),
        dni        = coalesce(excluded.dni, public.profiles.dni),
        active     = coalesce(public.profiles.active, true);

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (user_id, role, active, full_name)
  values (
    new.id,
    'pending',
    true,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (user_id) do update
    set active = true;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

--
-- Name: hhmm_from_seconds(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."hhmm_from_seconds"("p_seconds" bigint) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lpad(((greatest(p_seconds,0) / 3600))::text, 2, '0')
      || ':' ||
      lpad((((greatest(p_seconds,0) % 3600) / 60))::text, 2, '0');
$$;


ALTER FUNCTION "public"."hhmm_from_seconds"("p_seconds" bigint) OWNER TO "postgres";

--
-- Name: i_am_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."i_am_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(
    (select (lower(role) = 'admin') or (is_owner = true)
     from public.profiles
     where user_id = auth.uid()),
    false
  );
$$;


ALTER FUNCTION "public"."i_am_admin"() OWNER TO "postgres";

--
-- Name: i_am_owner(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."i_am_owner"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select coalesce(is_owner,false)
  from public.profiles
  where user_id = auth.uid()
  limit 1
$$;


ALTER FUNCTION "public"."i_am_owner"() OWNER TO "postgres";

--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce( (public.current_role() = 'admin'), false )
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";

--
-- Name: is_company_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_company_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(
    (
      select ((is_owner = true) or lower(coalesce(role,'')) = 'admin')
             and coalesce(active, true) = true
      from public.profiles
      where user_id = auth.uid()
      limit 1
    ),
    false
  )
$$;


ALTER FUNCTION "public"."is_company_admin"() OWNER TO "postgres";

--
-- Name: is_company_owner(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_company_owner"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(
    (
      select is_owner = true
             and coalesce(active, true) = true
      from public.profiles
      where user_id = auth.uid()
      limit 1
    ),
    false
  )
$$;


ALTER FUNCTION "public"."is_company_owner"() OWNER TO "postgres";

--
-- Name: is_current_user_admin_or_owner(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_current_user_admin_or_owner"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce((
    select
      case
        when p.is_owner = true then true
        when lower(coalesce(p.role, '')) = 'admin' then true
        else false
      end
    from public.profiles p
    where p.user_id = auth.uid()
  ), false);
$$;


ALTER FUNCTION "public"."is_current_user_admin_or_owner"() OWNER TO "postgres";

--
-- Name: is_current_user_owner(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_current_user_owner"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and is_owner = true
  );
$$;


ALTER FUNCTION "public"."is_current_user_owner"() OWNER TO "postgres";

--
-- Name: join_company("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."join_company"("p_join_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  cid uuid;
  v_role text;
  v_company_id uuid;
  v_is_owner boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_join_code is null or length(trim(p_join_code)) = 0 then
    raise exception 'Código obligatorio';
  end if;

  select id
    into cid
  from public.companies
  where join_code = trim(p_join_code);

  if cid is null then
    raise exception 'Código inválido';
  end if;

  select role, company_id, coalesce(is_owner, false)
    into v_role, v_company_id, v_is_owner
  from public.profiles
  where user_id = auth.uid();

  if not found then
    raise exception 'Perfil no encontrado';
  end if;

  if v_is_owner = true then
    raise exception 'El owner no puede unirse a una empresa con join_code';
  end if;

  if v_company_id is not null then
    raise exception 'Tu usuario ya está asociado a una empresa';
  end if;

  if lower(coalesce(v_role, 'pending')) not in ('pending', 'worker') then
    raise exception 'Tu rol actual no permite unirte con este código';
  end if;

  update public.profiles
  set company_id = cid,
      role = 'worker'
  where user_id = auth.uid();

  return cid;
end;
$$;


ALTER FUNCTION "public"."join_company"("p_join_code" "text") OWNER TO "postgres";

--
-- Name: my_company_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."my_company_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select company_id
  from public.profiles
  where user_id = auth.uid()
  limit 1
$$;


ALTER FUNCTION "public"."my_company_id"() OWNER TO "postgres";

--
-- Name: profiles_protect_columns(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."profiles_protect_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- si el usuario se actualiza a sí mismo y NO es owner:
  if (auth.uid() = new.user_id) and (public.is_company_owner() = false) then
    new.role := old.role;
    new.is_owner := old.is_owner;
    new.company_id := old.company_id;
    new.active := old.active;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."profiles_protect_columns"() OWNER TO "postgres";

--
-- Name: protect_owner_profiles(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."protect_owner_profiles"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- Si el registro que intentan modificar es OWNER, bloqueamos cambios críticos
  if old.is_owner = true then
    -- No permitir cambiar role, active, company_id, is_owner
    if (new.role is distinct from old.role)
       or (new.active is distinct from old.active)
       or (new.company_id is distinct from old.company_id)
       or (new.is_owner is distinct from old.is_owner) then
      raise exception 'No puedes modificar al OWNER de la empresa.';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."protect_owner_profiles"() OWNER TO "postgres";

--
-- Name: random_join_code(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."random_join_code"("len" integer DEFAULT 6) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out text := '';
  i int;
begin
  for i in 1..len loop
    out := out || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  end loop;
  return out;
end;
$$;


ALTER FUNCTION "public"."random_join_code"("len" integer) OWNER TO "postgres";

--
-- Name: rotate_join_code("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."rotate_join_code"("p_company_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_me_owner boolean;
  v_new_code text;
begin
  select coalesce(is_owner, false)
    into v_me_owner
  from public.profiles
  where user_id = auth.uid();

  if coalesce(v_me_owner, false) is not true then
    raise exception 'No autorizado';
  end if;

  v_new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  update public.companies
  set join_code = v_new_code
  where id = p_company_id;

  return v_new_code;
end;
$$;


ALTER FUNCTION "public"."rotate_join_code"("p_company_id" "uuid") OWNER TO "postgres";

--
-- Name: set_company_billing_status("uuid", boolean, "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."set_company_billing_status"("p_company_id" "uuid", "p_blocked" boolean, "p_plan" "text" DEFAULT NULL::"text", "p_plan_status" "text" DEFAULT NULL::"text", "p_billing_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_is_owner boolean;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select coalesce(is_owner, false)
    into v_is_owner
  from public.profiles
  where user_id = auth.uid()
  limit 1;

  if coalesce(v_is_owner, false) is not true then
    raise exception 'Solo el owner puede cambiar el estado de facturación';
  end if;

  update public.companies
  set
    blocked = p_blocked,
    plan = coalesce(p_plan, plan),
    plan_status = coalesce(p_plan_status, plan_status),
    billing_notes = p_billing_notes
  where id = p_company_id;
end;
$$;


ALTER FUNCTION "public"."set_company_billing_status"("p_company_id" "uuid", "p_blocked" boolean, "p_plan" "text", "p_plan_status" "text", "p_billing_notes" "text") OWNER TO "postgres";

--
-- Name: set_company_id_from_profile(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."set_company_id_from_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.company_id is null then
    new.company_id := public.get_my_company_id();
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_company_id_from_profile"() OWNER TO "postgres";

--
-- Name: set_creator_as_owner(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."set_creator_as_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.profiles
  set
    company_id = new.id,
    role = 'admin',
    is_owner = true,
    active = true
  where user_id = auth.uid();

  return new;
end;
$$;


ALTER FUNCTION "public"."set_creator_as_owner"() OWNER TO "postgres";

--
-- Name: tg_set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."tg_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


ALTER FUNCTION "public"."tg_set_updated_at"() OWNER TO "postgres";

--
-- Name: tg_vacation_requests_prevent_overlap(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."tg_vacation_requests_prevent_overlap"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- solo aplica cuando queda APPROVED (o ya estaba approved)
  if (tg_op = 'INSERT' and new.status = 'APPROVED')
     or (tg_op = 'UPDATE' and new.status = 'APPROVED') then

    if exists (
      select 1
      from public.vacation_requests vr
      where vr.company_id = new.company_id
        and vr.user_id = new.user_id
        and vr.status = 'APPROVED'
        and vr.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
        -- solape de rangos inclusivo
        and vr.start_date <= new.end_date
        and vr.end_date >= new.start_date
    ) then
      raise exception 'Ya existe una vacación APROBADA que se solapa con este rango';
    end if;

  end if;

  return new;
end $$;


ALTER FUNCTION "public"."tg_vacation_requests_prevent_overlap"() OWNER TO "postgres";

--
-- Name: tg_vacation_requests_validate_and_compute(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."tg_vacation_requests_validate_and_compute"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  c_id uuid;
begin
  if new.start_date is null or new.end_date is null then
    raise exception 'start_date y end_date son obligatorias';
  end if;

  if new.end_date < new.start_date then
    raise exception 'end_date no puede ser anterior a start_date';
  end if;

  -- company_id obligatorio: si no viene, lo cogemos de profiles
  if new.company_id is null then
    select company_id into c_id from public.profiles where user_id = new.user_id limit 1;
    if c_id is null then
      raise exception 'No se pudo inferir company_id del usuario';
    end if;
    new.company_id := c_id;
  end if;

  new.days_natural := (new.end_date - new.start_date) + 1;

  return new;
end $$;


ALTER FUNCTION "public"."tg_vacation_requests_validate_and_compute"() OWNER TO "postgres";

--
-- Name: planned_shifts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."planned_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "planned_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "break_minutes" integer DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."planned_shifts" OWNER TO "postgres";

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."profiles" (
    "user_id" "uuid" NOT NULL,
    "company_id" "uuid",
    "role" "text" NOT NULL,
    "full_name" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dni" "text",
    "is_owner" boolean DEFAULT false,
    "vacation_days_per_year" integer DEFAULT 30 NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'worker'::"text", 'pending'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";

--
-- Name: shifts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "company_id" "uuid"
);


ALTER TABLE "public"."shifts" OWNER TO "postgres";

--
-- Name: shift_plan_vs_real; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW "public"."shift_plan_vs_real" AS
 WITH "planned" AS (
         SELECT "ps"."id" AS "planned_shift_id",
            "ps"."company_id",
            "ps"."user_id",
            "ps"."planned_date",
            "ps"."start_time" AS "planned_start",
            "ps"."end_time" AS "planned_end",
            (((("ps"."planned_date")::"text" || ' '::"text") || "ps"."start_time"))::timestamp without time zone AS "planned_start_ts",
                CASE
                    WHEN ("ps"."end_time" <= "ps"."start_time") THEN (((((("ps"."planned_date" + '1 day'::interval))::"date")::"text" || ' '::"text") || "ps"."end_time"))::timestamp without time zone
                    ELSE (((("ps"."planned_date")::"text" || ' '::"text") || "ps"."end_time"))::timestamp without time zone
                END AS "planned_end_ts"
           FROM "public"."planned_shifts" "ps"
        ), "matched" AS (
         SELECT "p"."planned_shift_id",
            "p"."company_id",
            "p"."user_id",
            "p"."planned_date",
            "p"."planned_start",
            "p"."planned_end",
            "p"."planned_start_ts",
            "p"."planned_end_ts",
            "s"."id" AS "real_shift_id",
            "s"."started_at",
            "s"."ended_at"
           FROM ("planned" "p"
             LEFT JOIN LATERAL ( SELECT "s_1"."id",
                    "s_1"."user_id",
                    "s_1"."started_at",
                    "s_1"."ended_at",
                    "s_1"."company_id"
                   FROM "public"."shifts" "s_1"
                  WHERE (("s_1"."user_id" = "p"."user_id") AND ("s_1"."started_at" >= ("p"."planned_start_ts" - '04:00:00'::interval)) AND ("s_1"."started_at" <= ("p"."planned_end_ts" + '08:00:00'::interval)))
                  ORDER BY ("abs"(EXTRACT(epoch FROM ("s_1"."started_at" - ("p"."planned_start_ts")::timestamp with time zone))))
                 LIMIT 1) "s" ON (true))
        )
 SELECT "planned_shift_id",
    "company_id",
    "user_id",
    "planned_date",
    "planned_start",
    "planned_end",
    "real_shift_id",
    "started_at",
    "ended_at",
        CASE
            WHEN ("started_at" IS NULL) THEN NULL::integer
            ELSE GREATEST(0, ((EXTRACT(epoch FROM ("started_at" - ("planned_start_ts")::timestamp with time zone)) / (60)::numeric))::integer)
        END AS "late_minutes",
        CASE
            WHEN ("started_at" IS NULL) THEN NULL::integer
            ELSE GREATEST(0, ((EXTRACT(epoch FROM (("planned_start_ts")::timestamp with time zone - "started_at")) / (60)::numeric))::integer)
        END AS "early_entry_minutes",
        CASE
            WHEN ("ended_at" IS NULL) THEN NULL::integer
            ELSE GREATEST(0, ((EXTRACT(epoch FROM ("ended_at" - ("planned_end_ts")::timestamp with time zone)) / (60)::numeric))::integer)
        END AS "extra_minutes",
        CASE
            WHEN ("ended_at" IS NULL) THEN NULL::integer
            ELSE GREATEST(0, ((EXTRACT(epoch FROM (("planned_end_ts")::timestamp with time zone - "ended_at")) / (60)::numeric))::integer)
        END AS "early_leave_minutes",
        CASE
            WHEN ("real_shift_id" IS NULL) THEN 'NO_FICHAJE'::"text"
            WHEN (("ended_at" IS NULL) AND ("now"() > ("planned_end_ts" + '00:15:00'::interval))) THEN 'TURNO_INCOMPLETO'::"text"
            WHEN ("ended_at" IS NULL) THEN 'ABIERTO'::"text"
            WHEN ("ended_at" < "planned_start_ts") THEN 'FUERA_DE_TURNO'::"text"
            WHEN ("started_at" < ("planned_start_ts" - '00:15:00'::interval)) THEN 'ENTRADA_ANTICIPADA'::"text"
            WHEN ("started_at" > ("planned_start_ts" + '00:05:00'::interval)) THEN 'TARDE'::"text"
            WHEN ("ended_at" < ("planned_end_ts" - '00:05:00'::interval)) THEN 'SALIDA_ANTICIPADA'::"text"
            WHEN ("ended_at" > ("planned_end_ts" + '00:15:00'::interval)) THEN 'HORAS_EXTRA'::"text"
            ELSE 'OK'::"text"
        END AS "status"
   FROM "matched";


ALTER VIEW "public"."shift_plan_vs_real" OWNER TO "postgres";

--
-- Name: time_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."time_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "entry_type" "text" NOT NULL,
    "ts" timestamp with time zone DEFAULT "now"() NOT NULL,
    "shift_id" "uuid",
    "company_id" "uuid"
);


ALTER TABLE "public"."time_entries" OWNER TO "postgres";

--
-- Name: vacation_balances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."vacation_balances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "entitled_days" numeric(5,2) DEFAULT 30 NOT NULL,
    "carried_over_days" numeric(5,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vacation_balances" OWNER TO "postgres";

--
-- Name: vacation_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."vacation_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "days" numeric(5,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "note" "text",
    "admin_note" "text",
    "decided_by" "uuid",
    "decided_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vacation_requests_dates_check" CHECK (("end_date" >= "start_date")),
    CONSTRAINT "vacation_requests_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'APPROVED'::"text", 'REJECTED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."vacation_requests" OWNER TO "postgres";

--
-- Name: vacation_calendar; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW "public"."vacation_calendar" WITH ("security_invoker"='true') AS
 SELECT "id",
    "company_id",
    "user_id",
    "start_date",
    "end_date",
    "days",
    "status",
    "note",
    "admin_note",
    "created_at"
   FROM "public"."vacation_requests" "vr"
  WHERE ("status" = ANY (ARRAY['PENDING'::"text", 'APPROVED'::"text"]));


ALTER VIEW "public"."vacation_calendar" OWNER TO "postgres";

--
-- Name: vacation_policies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."vacation_policies" (
    "company_id" "uuid" NOT NULL,
    "days_per_year" integer DEFAULT 30 NOT NULL,
    "year_basis" "text" DEFAULT 'calendar'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vacation_policies" OWNER TO "postgres";

--
-- Name: companies companies_cif_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_cif_unique" UNIQUE ("cif");


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");


--
-- Name: planned_shifts planned_shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."planned_shifts"
    ADD CONSTRAINT "planned_shifts_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id");


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_pkey" PRIMARY KEY ("id");


--
-- Name: time_entries time_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id");


--
-- Name: vacation_balances vacation_balances_company_id_user_id_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vacation_balances"
    ADD CONSTRAINT "vacation_balances_company_id_user_id_year_key" UNIQUE ("company_id", "user_id", "year");


--
-- Name: vacation_balances vacation_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vacation_balances"
    ADD CONSTRAINT "vacation_balances_pkey" PRIMARY KEY ("id");


--
-- Name: vacation_policies vacation_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vacation_policies"
    ADD CONSTRAINT "vacation_policies_pkey" PRIMARY KEY ("company_id");


--
-- Name: vacation_requests vacation_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vacation_requests"
    ADD CONSTRAINT "vacation_requests_pkey" PRIMARY KEY ("id");


--
-- Name: companies_join_code_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "companies_join_code_key" ON "public"."companies" USING "btree" ("join_code");


--
-- Name: companies_join_code_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "companies_join_code_unique" ON "public"."companies" USING "btree" ("join_code");


--
-- Name: idx_vac_req_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_vac_req_company" ON "public"."vacation_requests" USING "btree" ("company_id");


--
-- Name: idx_vac_req_dates; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_vac_req_dates" ON "public"."vacation_requests" USING "btree" ("company_id", "start_date", "end_date");


--
-- Name: idx_vac_req_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_vac_req_status" ON "public"."vacation_requests" USING "btree" ("company_id", "status");


--
-- Name: idx_vac_req_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_vac_req_user" ON "public"."vacation_requests" USING "btree" ("company_id", "user_id");


--
-- Name: profiles_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "profiles_company_idx" ON "public"."profiles" USING "btree" ("company_id");


--
-- Name: profiles_one_owner_per_company; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "profiles_one_owner_per_company" ON "public"."profiles" USING "btree" ("company_id") WHERE ("is_owner" IS TRUE);


--
-- Name: vacation_balances_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "vacation_balances_company_idx" ON "public"."vacation_balances" USING "btree" ("company_id");


--
-- Name: vacation_requests_company_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "vacation_requests_company_idx" ON "public"."vacation_requests" USING "btree" ("company_id");


--
-- Name: vacation_requests_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "vacation_requests_status_idx" ON "public"."vacation_requests" USING "btree" ("status");


--
-- Name: vacation_requests_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "vacation_requests_user_idx" ON "public"."vacation_requests" USING "btree" ("user_id");


--
-- Name: profiles trg_enforce_single_owner_per_company; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_enforce_single_owner_per_company" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_single_owner_per_company"();


--
-- Name: profiles trg_profiles_protect_columns; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_profiles_protect_columns" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_protect_columns"();


--
-- Name: profiles trg_protect_owner_profiles; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_protect_owner_profiles" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_owner_profiles"();


--
-- Name: shifts trg_shifts_set_company; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_shifts_set_company" BEFORE INSERT ON "public"."shifts" FOR EACH ROW EXECUTE FUNCTION "public"."set_company_id_from_profile"();


--
-- Name: time_entries trg_time_entries_set_company; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_time_entries_set_company" BEFORE INSERT ON "public"."time_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_company_id_from_profile"();


--
-- Name: vacation_policies trg_vacation_policies_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_vacation_policies_updated_at" BEFORE UPDATE ON "public"."vacation_policies" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();


--
-- Name: companies companies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: companies companies_primary_admin_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_primary_admin_fk" FOREIGN KEY ("primary_admin_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE SET NULL;


--
-- Name: planned_shifts planned_shifts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."planned_shifts"
    ADD CONSTRAINT "planned_shifts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;


--
-- Name: planned_shifts planned_shifts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."planned_shifts"
    ADD CONSTRAINT "planned_shifts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: planned_shifts planned_shifts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."planned_shifts"
    ADD CONSTRAINT "planned_shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: profiles profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: shifts shifts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;


--
-- Name: time_entries time_entries_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");


--
-- Name: time_entries time_entries_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."time_entries"
    ADD CONSTRAINT "time_entries_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE CASCADE;


--
-- Name: vacation_balances vacation_balances_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vacation_balances"
    ADD CONSTRAINT "vacation_balances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;


--
-- Name: vacation_balances vacation_balances_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vacation_balances"
    ADD CONSTRAINT "vacation_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: vacation_policies vacation_policies_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vacation_policies"
    ADD CONSTRAINT "vacation_policies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;


--
-- Name: vacation_requests vacation_requests_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vacation_requests"
    ADD CONSTRAINT "vacation_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;


--
-- Name: vacation_requests vacation_requests_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vacation_requests"
    ADD CONSTRAINT "vacation_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "auth"."users"("id");


--
-- Name: vacation_requests vacation_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."vacation_requests"
    ADD CONSTRAINT "vacation_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: shifts admin select company shifts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admin select company shifts" ON "public"."shifts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."profiles" "me"
     JOIN "public"."profiles" "worker" ON (("worker"."user_id" = "shifts"."user_id")))
  WHERE (("me"."user_id" = "auth"."uid"()) AND ("me"."role" = 'admin'::"text") AND ("me"."company_id" IS NOT NULL) AND ("worker"."company_id" = "me"."company_id")))));


--
-- Name: time_entries admin select company time_entries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admin select company time_entries" ON "public"."time_entries" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."profiles" "me"
     JOIN "public"."profiles" "worker" ON (("worker"."user_id" = "time_entries"."user_id")))
  WHERE (("me"."user_id" = "auth"."uid"()) AND ("me"."role" = 'admin'::"text") AND ("me"."company_id" IS NOT NULL) AND ("worker"."company_id" = "me"."company_id")))));


--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;

--
-- Name: companies companies_select_my_company; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "companies_select_my_company" ON "public"."companies" FOR SELECT TO "authenticated" USING (("id" = "public"."get_my_company_id"()));


--
-- Name: shifts delete own shifts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "delete own shifts" ON "public"."shifts" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: time_entries delete own time_entries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "delete own time_entries" ON "public"."time_entries" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: shifts insert own shifts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "insert own shifts" ON "public"."shifts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: time_entries insert own time_entries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "insert own time_entries" ON "public"."time_entries" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: profiles owner can read all profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "owner can read all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."is_current_user_owner"());


--
-- Name: profiles owner can update profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "owner can update profiles" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."is_current_user_owner"()) WITH CHECK ("public"."is_current_user_owner"());


--
-- Name: companies owner manage companies; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "owner manage companies" ON "public"."companies" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND ("profiles"."is_owner" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND ("profiles"."is_owner" = true)))));


--
-- Name: planned_shifts planned shifts delete admin same company; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "planned shifts delete admin same company" ON "public"."planned_shifts" FOR DELETE TO "authenticated" USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"())
 LIMIT 1)) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND (("profiles"."is_owner" = true) OR ("lower"("profiles"."role") = 'admin'::"text")))))));


--
-- Name: planned_shifts planned shifts insert admin same company; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "planned shifts insert admin same company" ON "public"."planned_shifts" FOR INSERT TO "authenticated" WITH CHECK ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"())
 LIMIT 1)) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND (("profiles"."is_owner" = true) OR ("lower"("profiles"."role") = 'admin'::"text")))))));


--
-- Name: planned_shifts planned shifts select same company; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "planned shifts select same company" ON "public"."planned_shifts" FOR SELECT TO "authenticated" USING (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"())
 LIMIT 1)));


--
-- Name: planned_shifts planned shifts update admin same company; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "planned shifts update admin same company" ON "public"."planned_shifts" FOR UPDATE TO "authenticated" USING ((("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"())
 LIMIT 1)) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND (("profiles"."is_owner" = true) OR ("lower"("profiles"."role") = 'admin'::"text"))))))) WITH CHECK (("company_id" = ( SELECT "profiles"."company_id"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"())
 LIMIT 1)));


--
-- Name: planned_shifts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."planned_shifts" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_delete_owner_only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles_delete_owner_only" ON "public"."profiles" FOR DELETE TO "authenticated" USING (("public"."i_am_owner"() AND ("company_id" = "public"."get_my_company_id"()) AND (COALESCE("is_owner", false) = false) AND ("user_id" <> "auth"."uid"())));


--
-- Name: profiles profiles_select_owner_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles_select_owner_all" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR ("is_owner" = true)));


--
-- Name: profiles profiles_select_same_company; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles_select_same_company" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("company_id" = "public"."get_my_company_id"()));


--
-- Name: profiles profiles_update_admin_workers_only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles_update_admin_workers_only" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("public"."i_am_admin"() AND (NOT "public"."i_am_owner"()) AND ("company_id" = "public"."get_my_company_id"()) AND (COALESCE("is_owner", false) = false) AND ("lower"(COALESCE("role", 'worker'::"text")) <> 'admin'::"text") AND ("user_id" <> "auth"."uid"()))) WITH CHECK (("public"."i_am_admin"() AND (NOT "public"."i_am_owner"()) AND ("company_id" = "public"."get_my_company_id"()) AND (COALESCE("is_owner", false) = false) AND ("lower"(COALESCE("role", 'worker'::"text")) <> 'admin'::"text") AND ("user_id" <> "auth"."uid"())));


--
-- Name: profiles profiles_update_owner_same_company; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles_update_owner_same_company" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("public"."i_am_owner"() AND ("company_id" = "public"."get_my_company_id"()) AND ("user_id" <> "auth"."uid"()))) WITH CHECK (("public"."i_am_owner"() AND ("company_id" = "public"."get_my_company_id"()) AND ("user_id" <> "auth"."uid"())));


--
-- Name: profiles profiles_update_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: companies public read company by join_code; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "public read company by join_code" ON "public"."companies" FOR SELECT USING (("join_code" IS NOT NULL));


--
-- Name: shifts select own shifts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "select own shifts" ON "public"."shifts" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: time_entries select own time_entries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "select own time_entries" ON "public"."time_entries" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: shifts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."shifts" ENABLE ROW LEVEL SECURITY;

--
-- Name: shifts shifts_delete_clean; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "shifts_delete_clean" ON "public"."shifts" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."is_owner" = true) AND (COALESCE("p"."active", true) = true)))));


--
-- Name: shifts shifts_insert_clean; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "shifts_insert_clean" ON "public"."shifts" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND ("company_id" = "public"."get_my_company_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND (COALESCE("p"."active", true) = true))))));


--
-- Name: shifts shifts_select_clean; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "shifts_select_clean" ON "public"."shifts" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND (COALESCE("p"."active", true) = true) AND ("p"."company_id" = "shifts"."company_id") AND (("p"."is_owner" = true) OR ("lower"(COALESCE("p"."role", ''::"text")) = 'admin'::"text")))))));


--
-- Name: shifts shifts_update_clean; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "shifts_update_clean" ON "public"."shifts" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND (COALESCE("p"."active", true) = true))))));


--
-- Name: time_entries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."time_entries" ENABLE ROW LEVEL SECURITY;

--
-- Name: time_entries time_entries_delete_clean; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "time_entries_delete_clean" ON "public"."time_entries" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."is_owner" = true) AND (COALESCE("p"."active", true) = true)))));


--
-- Name: time_entries time_entries_insert_clean; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "time_entries_insert_clean" ON "public"."time_entries" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND ("company_id" = "public"."get_my_company_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND (COALESCE("p"."active", true) = true))))));


--
-- Name: time_entries time_entries_select_clean; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "time_entries_select_clean" ON "public"."time_entries" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."user_id" = "auth"."uid"()) AND ("p"."company_id" = "time_entries"."company_id") AND (COALESCE("p"."active", true) = true) AND (("p"."is_owner" = true) OR ("lower"(COALESCE("p"."role", ''::"text")) = 'admin'::"text")))))));


--
-- Name: time_entries time_entries_update_clean; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "time_entries_update_clean" ON "public"."time_entries" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: shifts update own shifts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "update own shifts" ON "public"."shifts" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: time_entries update own time_entries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "update own time_entries" ON "public"."time_entries" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: vacation_balances vac_bal_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "vac_bal_admin_all" ON "public"."vacation_balances" USING ((("company_id" = "public"."my_company_id"()) AND "public"."i_am_admin"())) WITH CHECK ((("company_id" = "public"."my_company_id"()) AND "public"."i_am_admin"()));


--
-- Name: vacation_balances vac_bal_select_own_or_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "vac_bal_select_own_or_admin" ON "public"."vacation_balances" FOR SELECT USING ((("company_id" = "public"."my_company_id"()) AND (("user_id" = "auth"."uid"()) OR "public"."i_am_admin"())));


--
-- Name: vacation_balances; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."vacation_balances" ENABLE ROW LEVEL SECURITY;

--
-- Name: vacation_policies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."vacation_policies" ENABLE ROW LEVEL SECURITY;

--
-- Name: vacation_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."vacation_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: vacation_requests vacation_requests_delete_clean; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "vacation_requests_delete_clean" ON "public"."vacation_requests" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"());


--
-- Name: vacation_requests vacation_requests_insert_clean; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "vacation_requests_insert_clean" ON "public"."vacation_requests" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") AND ("company_id" = "public"."get_my_company_id"())));


--
-- Name: vacation_requests vacation_requests_select_clean; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "vacation_requests_select_clean" ON "public"."vacation_requests" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (("company_id" = "public"."get_my_company_id"()) AND "public"."is_company_admin"())));


--
-- Name: vacation_requests vacation_requests_update_admin_clean; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "vacation_requests_update_admin_clean" ON "public"."vacation_requests" FOR UPDATE TO "authenticated" USING ((("company_id" = "public"."get_my_company_id"()) AND "public"."is_company_admin"())) WITH CHECK ((("company_id" = "public"."get_my_company_id"()) AND "public"."is_company_admin"()));


--
-- Name: vacation_requests vacation_requests_update_worker_clean; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "vacation_requests_update_worker_clean" ON "public"."vacation_requests" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_id") AND ("status" = 'PENDING'::"text"))) WITH CHECK ((("auth"."uid"() = "user_id") AND ("company_id" = "public"."get_my_company_id"()) AND ("status" = ANY (ARRAY['PENDING'::"text", 'CANCELLED'::"text"]))));


--
-- Name: vacation_policies vacpol_admin_write_own_company; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "vacpol_admin_write_own_company" ON "public"."vacation_policies" USING (("public"."is_company_admin"() AND ("company_id" = "public"."my_company_id"()))) WITH CHECK (("public"."is_company_admin"() AND ("company_id" = "public"."my_company_id"())));


--
-- Name: vacation_policies vacpol_select_own_company; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "vacpol_select_own_company" ON "public"."vacation_policies" FOR SELECT USING (("company_id" = "public"."my_company_id"()));


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "_caller_profile"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."_caller_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."_caller_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_caller_profile"() TO "service_role";


--
-- Name: FUNCTION "admin_decide_vacation_request"("p_request_id" "uuid", "p_status" "text", "p_admin_note" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."admin_decide_vacation_request"("p_request_id" "uuid", "p_status" "text", "p_admin_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_decide_vacation_request"("p_request_id" "uuid", "p_status" "text", "p_admin_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_decide_vacation_request"("p_request_id" "uuid", "p_status" "text", "p_admin_note" "text") TO "service_role";


--
-- Name: FUNCTION "admin_delete_user"("target_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."admin_delete_user"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_delete_user"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_user"("target_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "admin_set_user_active"("target_user_id" "uuid", "new_active" boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."admin_set_user_active"("target_user_id" "uuid", "new_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_set_user_active"("target_user_id" "uuid", "new_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_user_active"("target_user_id" "uuid", "new_active" boolean) TO "service_role";


--
-- Name: FUNCTION "admin_set_user_role"("target_user_id" "uuid", "new_role" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."admin_set_user_role"("target_user_id" "uuid", "new_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_set_user_role"("target_user_id" "uuid", "new_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_user_role"("target_user_id" "uuid", "new_role" "text") TO "service_role";


--
-- Name: FUNCTION "calc_days_natural"("p_start" "date", "p_end" "date"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."calc_days_natural"("p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."calc_days_natural"("p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calc_days_natural"("p_start" "date", "p_end" "date") TO "service_role";


--
-- Name: FUNCTION "change_primary_admin"("p_company_id" "uuid", "p_new_admin_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."change_primary_admin"("p_company_id" "uuid", "p_new_admin_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."change_primary_admin"("p_company_id" "uuid", "p_new_admin_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."change_primary_admin"("p_company_id" "uuid", "p_new_admin_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "create_company_and_assign_admin"("p_name" "text", "p_cif" "text", "p_admin_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."create_company_and_assign_admin"("p_name" "text", "p_cif" "text", "p_admin_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_company_and_assign_admin"("p_name" "text", "p_cif" "text", "p_admin_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_company_and_assign_admin"("p_name" "text", "p_cif" "text", "p_admin_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_company_and_assign_admin"("p_name" "text", "p_cif" "text", "p_admin_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "create_company_and_be_admin"("p_company_name" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."create_company_and_be_admin"("p_company_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_company_and_be_admin"("p_company_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_company_and_be_admin"("p_company_name" "text") TO "service_role";


--
-- Name: TABLE "companies"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";


--
-- Name: FUNCTION "create_company_simple"("p_name" "text", "p_cif" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."create_company_simple"("p_name" "text", "p_cif" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_company_simple"("p_name" "text", "p_cif" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_company_simple"("p_name" "text", "p_cif" "text") TO "service_role";


--
-- Name: FUNCTION "create_vacation_request"("p_start" "date", "p_end" "date", "p_note" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."create_vacation_request"("p_start" "date", "p_end" "date", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_vacation_request"("p_start" "date", "p_end" "date", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_vacation_request"("p_start" "date", "p_end" "date", "p_note" "text") TO "service_role";


--
-- Name: FUNCTION "current_company_id"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."current_company_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_company_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_company_id"() TO "service_role";


--
-- Name: FUNCTION "current_role"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."current_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_role"() TO "service_role";


--
-- Name: FUNCTION "current_user_company_id"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."current_user_company_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_company_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_company_id"() TO "service_role";


--
-- Name: FUNCTION "decide_vacation_request"("p_request_id" "uuid", "p_decision" "text", "p_admin_note" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."decide_vacation_request"("p_request_id" "uuid", "p_decision" "text", "p_admin_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."decide_vacation_request"("p_request_id" "uuid", "p_decision" "text", "p_admin_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decide_vacation_request"("p_request_id" "uuid", "p_decision" "text", "p_admin_note" "text") TO "service_role";


--
-- Name: FUNCTION "duplicate_planned_week"("p_company_id" "uuid", "p_from_monday" "date", "p_to_monday" "date"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."duplicate_planned_week"("p_company_id" "uuid", "p_from_monday" "date", "p_to_monday" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."duplicate_planned_week"("p_company_id" "uuid", "p_from_monday" "date", "p_to_monday" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."duplicate_planned_week"("p_company_id" "uuid", "p_from_monday" "date", "p_to_monday" "date") TO "service_role";


--
-- Name: FUNCTION "enforce_single_owner_per_company"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."enforce_single_owner_per_company"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_single_owner_per_company"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_single_owner_per_company"() TO "service_role";


--
-- Name: FUNCTION "gen_join_code"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."gen_join_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."gen_join_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gen_join_code"() TO "service_role";


--
-- Name: FUNCTION "gen_join_code"("len" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."gen_join_code"("len" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."gen_join_code"("len" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gen_join_code"("len" integer) TO "service_role";


--
-- Name: FUNCTION "get_dashboard_calendar_days"("p_from" "date", "p_to" "date"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_dashboard_calendar_days"("p_from" "date", "p_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_calendar_days"("p_from" "date", "p_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_calendar_days"("p_from" "date", "p_to" "date") TO "service_role";


--
-- Name: FUNCTION "get_dashboard_metrics"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_dashboard_metrics"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_metrics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_metrics"() TO "service_role";


--
-- Name: FUNCTION "get_dashboard_metrics_v2"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_dashboard_metrics_v2"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_metrics_v2"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_metrics_v2"() TO "service_role";


--
-- Name: FUNCTION "get_my_company_id"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_my_company_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_company_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_company_id"() TO "service_role";


--
-- Name: FUNCTION "handle_new_auth_user"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";


--
-- Name: FUNCTION "handle_new_user"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


--
-- Name: FUNCTION "hhmm_from_seconds"("p_seconds" bigint); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."hhmm_from_seconds"("p_seconds" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."hhmm_from_seconds"("p_seconds" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hhmm_from_seconds"("p_seconds" bigint) TO "service_role";


--
-- Name: FUNCTION "i_am_admin"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."i_am_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."i_am_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."i_am_admin"() TO "service_role";


--
-- Name: FUNCTION "i_am_owner"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."i_am_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."i_am_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."i_am_owner"() TO "service_role";


--
-- Name: FUNCTION "is_admin"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";


--
-- Name: FUNCTION "is_company_admin"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_company_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_company_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_company_admin"() TO "service_role";


--
-- Name: FUNCTION "is_company_owner"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_company_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_company_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_company_owner"() TO "service_role";


--
-- Name: FUNCTION "is_current_user_admin_or_owner"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_current_user_admin_or_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_current_user_admin_or_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_current_user_admin_or_owner"() TO "service_role";


--
-- Name: FUNCTION "is_current_user_owner"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_current_user_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_current_user_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_current_user_owner"() TO "service_role";


--
-- Name: FUNCTION "join_company"("p_join_code" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."join_company"("p_join_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."join_company"("p_join_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_company"("p_join_code" "text") TO "service_role";


--
-- Name: FUNCTION "my_company_id"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."my_company_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_company_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_company_id"() TO "service_role";


--
-- Name: FUNCTION "profiles_protect_columns"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."profiles_protect_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_protect_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_protect_columns"() TO "service_role";


--
-- Name: FUNCTION "protect_owner_profiles"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."protect_owner_profiles"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_owner_profiles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_owner_profiles"() TO "service_role";


--
-- Name: FUNCTION "random_join_code"("len" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."random_join_code"("len" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."random_join_code"("len" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."random_join_code"("len" integer) TO "service_role";


--
-- Name: FUNCTION "rotate_join_code"("p_company_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."rotate_join_code"("p_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rotate_join_code"("p_company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rotate_join_code"("p_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rotate_join_code"("p_company_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "set_company_billing_status"("p_company_id" "uuid", "p_blocked" boolean, "p_plan" "text", "p_plan_status" "text", "p_billing_notes" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_company_billing_status"("p_company_id" "uuid", "p_blocked" boolean, "p_plan" "text", "p_plan_status" "text", "p_billing_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_company_billing_status"("p_company_id" "uuid", "p_blocked" boolean, "p_plan" "text", "p_plan_status" "text", "p_billing_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_company_billing_status"("p_company_id" "uuid", "p_blocked" boolean, "p_plan" "text", "p_plan_status" "text", "p_billing_notes" "text") TO "service_role";


--
-- Name: FUNCTION "set_company_id_from_profile"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_company_id_from_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_company_id_from_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_company_id_from_profile"() TO "service_role";


--
-- Name: FUNCTION "set_creator_as_owner"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_creator_as_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_creator_as_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_creator_as_owner"() TO "service_role";


--
-- Name: FUNCTION "tg_set_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "service_role";


--
-- Name: FUNCTION "tg_vacation_requests_prevent_overlap"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."tg_vacation_requests_prevent_overlap"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_vacation_requests_prevent_overlap"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_vacation_requests_prevent_overlap"() TO "service_role";


--
-- Name: FUNCTION "tg_vacation_requests_validate_and_compute"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."tg_vacation_requests_validate_and_compute"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_vacation_requests_validate_and_compute"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_vacation_requests_validate_and_compute"() TO "service_role";


--
-- Name: TABLE "planned_shifts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."planned_shifts" TO "anon";
GRANT ALL ON TABLE "public"."planned_shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."planned_shifts" TO "service_role";


--
-- Name: TABLE "profiles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";


--
-- Name: TABLE "shifts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."shifts" TO "anon";
GRANT ALL ON TABLE "public"."shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."shifts" TO "service_role";


--
-- Name: TABLE "shift_plan_vs_real"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."shift_plan_vs_real" TO "anon";
GRANT ALL ON TABLE "public"."shift_plan_vs_real" TO "authenticated";
GRANT ALL ON TABLE "public"."shift_plan_vs_real" TO "service_role";


--
-- Name: TABLE "time_entries"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."time_entries" TO "anon";
GRANT ALL ON TABLE "public"."time_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."time_entries" TO "service_role";


--
-- Name: TABLE "vacation_balances"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vacation_balances" TO "anon";
GRANT ALL ON TABLE "public"."vacation_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."vacation_balances" TO "service_role";


--
-- Name: TABLE "vacation_requests"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vacation_requests" TO "anon";
GRANT ALL ON TABLE "public"."vacation_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."vacation_requests" TO "service_role";


--
-- Name: TABLE "vacation_calendar"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vacation_calendar" TO "anon";
GRANT ALL ON TABLE "public"."vacation_calendar" TO "authenticated";
GRANT ALL ON TABLE "public"."vacation_calendar" TO "service_role";


--
-- Name: TABLE "vacation_policies"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."vacation_policies" TO "anon";
GRANT ALL ON TABLE "public"."vacation_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."vacation_policies" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

\unrestrict ILUGw6h4IQjoO4yLvUVq12rBthg3W5cZNISCQSSFNayHY1ZFlMbtNbcyVSoXphc

