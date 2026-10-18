import type { Piece } from "./types";

export function calendarPlanDate(
  piece: Pick<Piece, "status" | "scheduledFor">,
): Date | null;
