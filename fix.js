const fs = require('fs');
const path = 'c:/Users/colon/Downloads/mrtpvrest/apps/tpv/src/components/pos/SidebarTicket.tsx';
let content = fs.readFileSync(path, 'utf8');

const target = `      if (activeOrderId) {
        // Mesa ya tiene orden abierta — agregar ronda.
        const res = await apiOrQueue("order", "POST", \`/api/orders/\${activeOrderId}/items\`, { items: itemsPayload });
        if (!res.ok) throw new Error(res.error || "fallo desconocido");
        queued = res.queued;
        order = res.data;
        // Sincronizar historial local
        if (!queued) setPreviousItems(order?.items || []);
      } else {
        // Orden nueva (o el backend redirigirá si la mesa está OCCUPIED).
        const orderData = {
          orderType: ticket.type,
          items: itemsPayload,
        // Sincronizar historial local
        if (!queued) setPreviousItems(order?.items || []);
      } else {
        // Orden nueva (o el backend redirigirá si la mesa está OCCUPIED).
        const orderData = {
          orderType: ticket.type,
          items: itemsPayload,
          tableId: ticket.tableId || null,
          numberOfGuests: ticket.numberOfGuests ?? null,
          customerName: ticket.name || "Publico General",
          customerPhone: ticket.phone || null,
          subtotal: currentSubtotal,
          discount: ticket.discount,
          total: currentSubtotal - ticket.discount,
        };
        const res = await apiOrQueue("order", "POST", "/api/orders/tpv", orderData);
        if (!res.ok) throw new Error(res.error || "fallo desconocido");
        queued = res.queued;
        order = res.data;
        // Guardar el id para que la siguiente ronda ya conozca la orden.
        if (order?.id && ticket.tableId) {
          setActiveOrder(order.id, ticket.tableId, order.orderNumber ?? null);
        }
        if (!queued) setPreviousItems(order?.items || []);
      }

      toast.success(queued ? "Pedido en cola · se enviara al volver la red" : "Pedido enviado a cocina");`;

const replacement = `      if (activeOrderId) {
        // Mesa ya tiene orden abierta — agregar ronda.
        const res = await apiOrQueue("order", "POST", \`/api/orders/\${activeOrderId}/items\`, { items: itemsPayload });
        if (!res.ok) throw new Error(res.error || "fallo desconocido");
        queued = res.queued;
        order = res.data;
        // Sincronizar historial local
        if (!queued) setPreviousItems(order?.items || []);
      } else {
        // Orden nueva (o el backend redirigirá si la mesa está OCCUPIED).
        const orderData = {
          orderType: ticket.type,
          items: itemsPayload,
          tableId: ticket.tableId || null,
          numberOfGuests: ticket.numberOfGuests ?? null,
          customerName: ticket.name || "Publico General",
          customerPhone: ticket.phone || null,
          subtotal: currentSubtotal,
          discount: ticket.discount,
          total: currentSubtotal - ticket.discount,
        };
        const res = await apiOrQueue("order", "POST", "/api/orders/tpv", orderData);
        if (!res.ok) throw new Error(res.error || "fallo desconocido");
        queued = res.queued;
        order = res.data;
        // Guardar el id para que la siguiente ronda ya conozca la orden.
        if (order?.id && ticket.tableId) {
          setActiveOrder(order.id, ticket.tableId, order.orderNumber ?? null);
        }
        if (!queued) setPreviousItems(order?.items || []);
      }

      toast.success(queued ? "Pedido en cola · se enviara al volver la red" : "Pedido enviado a cocina");`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(path, content, 'utf8');
  console.log("Fix applied successfully.");
} else {
  console.log("Target not found. Current block around line 260:");
  const lines = content.split('\\n');
  console.log(lines.slice(250, 280).join('\\n'));
}
