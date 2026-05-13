const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const restaurant = await prisma.restaurant.findFirst();
  if (!restaurant) {
    console.log('No restaurant found');
    return;
  }
  
  const locations = await prisma.location.findMany({
    where: { restaurantId: restaurant.id }
  });
  
  const locationId = locations[0]?.id;
  
  const items = await prisma.menuItem.findMany({
    where: { restaurantId: restaurant.id },
    take: 5
  });

  const employees = locationId ? await prisma.employee.findMany({
    where: { locationId },
    take: 5
  }) : [];

  const tables = locationId ? await prisma.table.findMany({
    where: { locationId },
    take: 5
  }) : [];

  console.log(JSON.stringify({
    restaurant: { id: restaurant.id, name: restaurant.name },
    locations: locations.map(l => ({ id: l.id, name: l.name })),
    sampleItems: items.map(i => ({ id: i.id, name: i.name })),
    sampleEmployees: employees.map(e => ({ id: e.id, name: e.name, pin: e.pin })),
    sampleTables: tables.map(t => ({ id: t.id, name: t.name }))
  }, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
