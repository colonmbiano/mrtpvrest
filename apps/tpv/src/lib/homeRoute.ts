// Pantalla de inicio tras validar el PIN. Una comandera (deviceRole WAITER) con
// un mesero va directo al salón; cualquier otro caso pasa por el hub, que decide
// sucursal y turno. /locked y el hub usan la MISMA regla: si /locked navegara a
// /hub mientras el hub ya mandó al mesero a /meseros, la segunda navegación pisaba
// a la primera y el mesero se quedaba en el hub (el hub ya montado no vuelve a decidir).
export type HomeRoute = "/meseros" | "/hub";

export function homeRouteFor(employeeRole: string | null | undefined): HomeRoute {
  const deviceRole = typeof window !== "undefined" ? localStorage.getItem("deviceRole") : null;
  return deviceRole === "WAITER" && employeeRole === "WAITER" ? "/meseros" : "/hub";
}
