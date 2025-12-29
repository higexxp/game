export const TIME_SLOTS = ["morning", "noon", "evening", "night"] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number];

export const TIME_SLOT_LABEL: Record<TimeSlot, string> = {
  morning: "朝",
  noon: "昼",
  evening: "夕方",
  night: "夜",
};

export function nextSlot(slot: TimeSlot): { slot: TimeSlot; dayDelta: number } {
  const i = TIME_SLOTS.indexOf(slot);
  const ni = (i + 1) % TIME_SLOTS.length;
  return { slot: TIME_SLOTS[ni], dayDelta: ni === 0 ? 1 : 0 };
}
