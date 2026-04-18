/**
 * Navigation type definitions for the mobile-tpv stack navigator.
 * Import `RootStackParamList` in any screen that uses `NativeStackScreenProps`.
 */
export type RootStackParamList = {
  Setup: undefined;
  Pin: undefined;
  Dashboard: undefined;
  TableDetail: { tableNumber: number };
  /**
   * `orderId` switches the screen into "round mode" — it adds items to an
   * existing open order instead of creating a new one. Omit for a fresh sale.
   */
  NewOrder: { orderId?: string } | undefined;
  /** Shift summary + paid-ticket audit (admin can void payments). */
  Shift: undefined;
};
