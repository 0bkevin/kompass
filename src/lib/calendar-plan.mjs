// Status is the server's approval gate. A residual date does not establish a plan.
export function calendarPlanDate(piece) {
  if (!["scheduled", "published"].includes(piece.status) || !piece.scheduledFor)
    return null;
  const date = new Date(piece.scheduledFor);
  return Number.isFinite(date.getTime()) ? date : null;
}
