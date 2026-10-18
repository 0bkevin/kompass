/** Outcome inputs show seconds; unchanged values retain their original milliseconds. */
export function outcomeLocalDateTime(value?: string): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
}

export function outcomePublicationDate(
  value: string,
  original?: string,
): string {
  return original && value === outcomeLocalDateTime(original)
    ? original
    : new Date(value).toISOString();
}

export function outcomeMeasurementUpdate(
  value: string,
  original?: string,
): { measuredAt?: string | null } {
  if (original && value === outcomeLocalDateTime(original)) return {};
  return { measuredAt: value ? new Date(value).toISOString() : null };
}
