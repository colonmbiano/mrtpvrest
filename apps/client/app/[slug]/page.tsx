import { notFound } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://master-burguers-production.up.railway.app'

interface MenuItem {
  id: string
  name: string
  description?: string
  price: number
  imageUrl?: string
  isAvailable: boolean
  isPromo: boolean
  activeDays: string[]
}

interface Category {
  id: string
  name: string
  items: MenuItem[]
}

interface MenuData {
  restaurant: { name: string; logoUrl?: string }
  categories: Category[]
  todayDay: string
}

async function getMenu(slug: string): Promise<MenuData | null> {
  try {
    const res = await fetch(`${API_URL}/api/public/${slug}/menu`, {
      next: { revalidate: 30 },
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error('Error fetching menu')
    return res.json()
  } catch {
    return null
  }
}

function ItemCard({ item, isPromoToday }: { item: MenuItem; isPromoToday: boolean }) {
  return (
    <div className="relative flex gap-4 bg-white rounded-xl border border-gray-100 p-4 hover:border-orange-200 hover:shadow-sm transition-all">
      {isPromoToday && (
        <span className="absolute top-3 left-3 bg-orange-500 text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-sm">
          🔥 Promo
        </span>
      )}
      <div className={`flex-1 min-w-0 ${isPromoToday ? 'pt-5' : ''}`}>
        <h3 className="font-semibold text-gray-900 text-sm">{item.name}</h3>
        {item.description && (
          <p className="text-xs text-gray-400 mt-1 line-clamp-2">{item.description}</p>
        )}
        <p className="mt-2 font-bold text-orange-500 text-sm">
          ${item.price.toFixed(2)}
        </p>
      </div>
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt={item.name}
          className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
        />
      )}
    </div>
  )
}

export default async function RestaurantPage({
  params,
}: {
  params: { slug: string }
}) {
  const menu = await getMenu(params.slug)

  if (!menu) notFound()

  // Items que son promos activas hoy (backend ya filtró las inactivas,
  // así que todo item con isPromo=true en la respuesta es válido hoy)
  const promoItems = menu.categories
    .flatMap(cat => cat.items)
    .filter(item => item.isPromo)

  const promoIds = new Set(promoItems.map(i => i.id))

  // Categoría virtual al inicio si hay promos hoy
  const virtualPromoCategory: Category | null =
    promoItems.length > 0
      ? { id: '__promos__', name: '🔥 Promociones de Hoy', items: promoItems }
      : null

  const allCategories = [
    ...(virtualPromoCategory ? [virtualPromoCategory] : []),
    ...menu.categories,
  ]

  const availableCategories = allCategories.filter(
    cat => cat.items.some(item => item.isAvailable !== false)
  )

  if (availableCategories.length === 0) {
    return (
      <div className="text-center py-24 text-gray-400">
        <p className="text-4xl mb-4">🍽️</p>
        <p className="text-lg font-medium">El menú no está disponible en este momento.</p>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      {availableCategories.map((category) => (
        <section key={category.id}>
          <h2 className="text-xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">
            {category.name}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {category.items
              .filter(item => item.isAvailable !== false)
              .map(item => (
                <ItemCard
                  key={item.id}
                  item={item}
                  isPromoToday={promoIds.has(item.id)}
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  )
}
