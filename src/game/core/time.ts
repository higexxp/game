export type TimeSlot = "morning" | "noon" | "evening" | "night";

export const TIME_SLOTS: TimeSlot[] = ["morning", "noon", "evening", "night"];

export const TIME_SLOT_LABEL: Record<TimeSlot, string> = {
  morning: "朝",
  noon: "昼",
  evening: "夕",
  night: "夜",
};
