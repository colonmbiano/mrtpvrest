#!/usr/bin/env node
// CLI de prueba del núcleo wa-orders.
//
//   node src/cli.js "2 alitas bbq y una hawaiana"            → solo PARSEA (dry)
//   node src/cli.js "..." --send                              → CREA el pedido en el TPV
//   node src/cli.js "..." --send --type DELIVERY --address "Calle 5 #10" --phone 7221234567 --name "Juan"
//
// Flags: --slug (def. master-burguer-s), --send, --type, --address, --phone,
//        --name, --api (base URL).

import { textToOrder } from "./index.js";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) { args[key] = next; i++; }
      else args[key] = true;
    } else args._.push(a);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const text = args._.join(" ").trim();
if (!text) {
  console.error('Uso: node src/cli.js "tu pedido aquí" [--send] [--slug ...] [--type DELIVERY] [--address ...] [--phone ...] [--name ...]');
  process.exit(1);
}

const slug = args.slug || "master-burguer-s";
const dryRun = !args.send;

const money = (n) => "$" + Number(n || 0).toFixed(2);

const useAi = args["no-ai"] ? false : args.ai ? true : "auto";

const res = await textToOrder({
  slug,
  text,
  orderType: args.type,
  dryRun,
  useAi,
  apiBase: args.api,
  customer: { name: args.name, phone: args.phone, address: args.address },
});

console.log("\n── Mensaje ──");
console.log(" ", text);
console.log(`\n── Productos reconocidos (motor: ${res.engine}) ──`);
if (res.parsed.length === 0) console.log("  (ninguno)");
for (const it of res.parsed) {
  console.log(`  ${it.quantity}x  ${it.label}  ${money(it.price)}  [confianza: ${it.confidence}]`);
}
if (res.unmatched.length) {
  console.log("\n── No reconocido (revisar) ──");
  for (const u of res.unmatched) console.log("  ?", u);
}

if (dryRun) {
  console.log("\n(DRY-RUN) No se creó el pedido. Agrega --send para mandarlo al TPV.\n");
} else if (res.created) {
  console.log("\n✅ Pedido creado en el TPV (PENDING en 'Pedidos Web')");
  console.log("   #", res.order?.orderNumber || res.order?.id, "· total", money(res.order?.total));
  console.log("   El cajero debe ACEPTARLO para mandarlo a cocina.\n");
} else {
  console.log("\n❌ No se pudo crear:", res.error, res.code ? `(${res.code})` : "", "\n");
}
