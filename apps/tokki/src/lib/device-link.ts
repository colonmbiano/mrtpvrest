const LINK_COOKIE = "tpv-device-linked=true";
const LINK_COOKIE_OPTIONS = "path=/; max-age=31536000; SameSite=Lax";
// deviceToken se migra al almacén seguro nativo y, por diseño, deja de existir
// en localStorage. Los identificadores no sensibles bastan para restaurar la
// marca visual de vinculación después de actualizar la APK.
const REQUIRED_LINK_KEYS = ["deviceId", "locationId", "restaurantId"] as const;

export function setLinkedDeviceCookie() {
  if (typeof document !== "undefined") {
    document.cookie = `${LINK_COOKIE}; ${LINK_COOKIE_OPTIONS}`;
  }
}

export function clearLinkedDeviceCookie() {
  if (typeof document !== "undefined") {
    document.cookie = "tpv-device-linked=; path=/; max-age=0; SameSite=Lax";
  }
}

export function hasLinkedDevice() {
  if (typeof window === "undefined") return false;
  if (document.cookie.includes(LINK_COOKIE)) return true;

  const storedLinkIsComplete = REQUIRED_LINK_KEYS.every((key) => Boolean(localStorage.getItem(key)));
  if (storedLinkIsComplete) setLinkedDeviceCookie();
  return storedLinkIsComplete;
}
