/** Map technical errors to short Spanish messages for UI. */
export function userFacingError(err: unknown, fallback = "Ha ocurrido un error. Inténtalo de nuevo.") {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : typeof err === "object" && err && "message" in err
          ? String((err as { message: unknown }).message)
          : "";

  if (raw) {
    // Keep short known messages; hide long PostgREST dumps.
    if (raw.length <= 120 && !/^(PGRST|JWT|postgres)/i.test(raw)) {
      return raw;
    }
    console.error("[Fichagest]", raw);
  }
  return fallback;
}
