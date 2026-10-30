import { homeRouteFor } from "@/lib/homeRoute";

describe("homeRouteFor: destino tras el PIN, compartido por /locked y el hub", () => {
  afterEach(() => localStorage.clear());

  it("una comandera con un mesero va directo al salón", () => {
    localStorage.setItem("deviceRole", "WAITER");
    expect(homeRouteFor("WAITER")).toBe("/meseros");
  });

  it("otros roles en la comandera pasan por el hub (POS normal)", () => {
    localStorage.setItem("deviceRole", "WAITER");
    for (const role of ["CASHIER", "ADMIN", "OWNER", "MANAGER", "KITCHEN"]) {
      expect(homeRouteFor(role)).toBe("/hub");
    }
  });

  it("un mesero en una caja (o sin rol de dispositivo) pasa por el hub", () => {
    expect(homeRouteFor("WAITER")).toBe("/hub");
    localStorage.setItem("deviceRole", "POS");
    expect(homeRouteFor("WAITER")).toBe("/hub");
  });

  it("sin empleado no adivina el salón", () => {
    localStorage.setItem("deviceRole", "WAITER");
    expect(homeRouteFor(null)).toBe("/hub");
    expect(homeRouteFor(undefined)).toBe("/hub");
  });
});
