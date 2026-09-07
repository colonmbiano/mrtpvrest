export const TAKEOUT_MODE = process.env.NEXT_PUBLIC_LITE_MODE === "takeout";

export const APP_HOME = TAKEOUT_MODE ? "/menu" : "/mesas";

