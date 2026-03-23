export const MINIMUM_LEAD_HOURS = 72;

export function getMinimumBookingDate() {
  return new Date(Date.now() + MINIMUM_LEAD_HOURS * 60 * 60 * 1000);
}

export function isSlotBookable(slotStart) {
  if (!(slotStart instanceof Date) || Number.isNaN(slotStart.getTime())) {
    return false;
  }
  return slotStart.getTime() >= getMinimumBookingDate().getTime();
}
