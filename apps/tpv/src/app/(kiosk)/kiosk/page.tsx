"use client";

import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { getApiUrl } from "@/lib/config";
import type { Category, CartItem, MenuItem, Screen } from "./_lib/types";
import ItemModal from "./_components/ItemModal";
import MenuScreen from "./_components/MenuScreen";
import CartScreen from "./_components/CartScreen";
import {
  ForbiddenScreen,
  NoProviderScreen,
  SuccessScreen,
  ErrorScreen,
  PaymentScreen,
} from "./_components/StatusScreens";

function tenantHeaders(extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extra };
  if (typeof window === "undefined") return headers;
  const restaurantId = localStorage.getItem("restaurantId");
  const locationId = localStorage.getItem("locationId");
  if (restaurantId) headers["x-restaurant-id"] = restaurantId;
  if (locationId) headers["x-location-id"] = locationId;
  return headers;
}

export default function KioskPage() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [tableNumber, setTableNumber] = useState<string>("");

  // Lee el resultado de pago de MP desde la URL (back_urls)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const oid = params.get("orderId");
    if (status === "success") { setOrderId(oid); setScreen("success"); }
    if (status === "failure") { setScreen("error"); }
  }, []);

  const loadMenu = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await axios.get(`${getApiUrl()}/api/kiosk/menu`, { headers: tenantHeaders() });
      const cats = (data as Category[]).filter((c) => c.items.length > 0);
      setCategories(cats);
      if (cats[0]) setActiveCategory(cats[0].id);
    } catch (err: any) {
      if (err?.response?.status === 403) setScreen("forbidden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (screen === "menu") loadMenu();
  }, [screen, loadMenu]);

  function addToCart(item: MenuItem, mods: CartItem["modifiers"]) {
    setCart((prev) => {
      const existing = prev.find(
        (c) => c.menuItemId === item.id && JSON.stringify(c.modifiers) === JSON.stringify(mods),
      );
      if (existing) {
        return prev.map((c) =>
          c.menuItemId === item.id && JSON.stringify(c.modifiers) === JSON.stringify(mods)
            ? { ...c, quantity: c.quantity + 1 }
            : c,
        );
      }
      return [
        ...prev,
        { menuItemId: item.id, name: item.name, price: item.price, quantity: 1, modifiers: mods },
      ];
    });
    setSelectedItem(null);
  }

  function updateQty(idx: number, delta: number) {
    setCart((prev) =>
      prev
        .map((c, i) => (i === idx ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0),
    );
  }

  async function placeOrder() {
    if (!cart.length || ordering) return;
    setOrdering(true);
    try {
      const headers = tenantHeaders({ "Content-Type": "application/json" });
      const locationId = typeof window !== "undefined" ? localStorage.getItem("locationId") : null;
      const { data } = await axios.post(
        `${getApiUrl()}/api/kiosk/orders`,
        {
          items: cart.map((c) => ({
            menuItemId: c.menuItemId,
            quantity:   c.quantity,
            modifiers:  c.modifiers.map((m) => ({ modifierId: m.modifierId })),
          })),
          tableNumber: tableNumber ? Number(tableNumber) : null,
          locationId:  locationId ?? undefined,
        },
        { headers },
      );

      setOrderId(data.order?.id ?? null);
      setPaymentProvider(data.provider ?? null);
      if (data.checkoutUrl) {
        setCheckoutUrl(data.checkoutUrl);
        setScreen("payment");
      } else {
        setScreen("success");
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "";
      if (err?.response?.status === 400 && /pasarela/i.test(msg)) {
        setScreen("no-provider");
      } else {
        setScreen("error");
      }
    } finally {
      setOrdering(false);
    }
  }

  function resetKiosk() {
    setCart([]);
    setCheckoutUrl(null);
    setPaymentProvider(null);
    setOrderId(null);
    setTableNumber("");
    setScreen("menu");
  }

  if (screen === "forbidden") return <ForbiddenScreen />;
  if (screen === "no-provider") return <NoProviderScreen onBack={() => setScreen("cart")} />;
  if (screen === "success") return <SuccessScreen orderId={orderId} onReset={resetKiosk} />;
  if (screen === "error") return <ErrorScreen onReset={resetKiosk} />;
  if (screen === "payment" && checkoutUrl) {
    return (
      <PaymentScreen
        checkoutUrl={checkoutUrl}
        paymentProvider={paymentProvider}
        onReset={resetKiosk}
      />
    );
  }

  if (screen === "cart") {
    return (
      <CartScreen
        cart={cart}
        tableNumber={tableNumber}
        ordering={ordering}
        onTableChange={setTableNumber}
        onUpdateQty={updateQty}
        onBack={() => setScreen("menu")}
        onPlaceOrder={placeOrder}
      />
    );
  }

  return (
    <>
      <MenuScreen
        categories={categories}
        cart={cart}
        loading={loading}
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        onSelectItem={setSelectedItem}
        onOpenCart={() => setScreen("cart")}
      />
      {selectedItem && (
        <ItemModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onAdd={(mods) => addToCart(selectedItem, mods)}
        />
      )}
    </>
  );
}
