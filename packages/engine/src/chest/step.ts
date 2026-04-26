import { type Chest } from "./types.js";

// Pure: returns a fresh Chest with the open timer decremented if the
// chest is mid-animation. Any other status is unchanged. The
// closed → opening transition is driven by stepWorld (it owns the
// archer-collision check and the opener assignment), and the
// opening → opened transition + delivery happens there too — keeping
// stepChest a pure timer tick keeps it trivially testable.
export const stepChest = (chest: Chest): Chest => {
  if (chest.status !== "opening") return chest;
  const openTimer = Math.max(0, chest.openTimer - 1);
  return { ...chest, openTimer };
};
