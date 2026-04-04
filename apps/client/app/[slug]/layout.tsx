import type { Metadata } from 'next'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://master-burguers-production.up.railway.app'

interface RestaurantInfo {
  name: string
  logo?: string
  primaryColor?: string
  description?: string
}

async function getRestaurant(slug: string): Promise<RestaurantInfo | null> {
  try {
    const res = await fetch(`${API_URL}/api/public/${slug}/restaurant`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const restaurant = await getRestaurant(params.slug)
  return {
    title: restaurant ? `${restaurant.name} — Menú online` : 'Restaurante',
    description: restaurant?.description ?? 'Consulta nuestro menú y haz tu pedido.',
  }
}

export default async function SlugLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { slug: string }
}) {
  const restaurant = await getRestaurant(params.slug)
  const primaryColor = restaurant?.primaryColor ?? '#f97316'

  return (
    <div style={{ '--primary-color': primaryColor } as React.CSSProperties}>
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-3">
          {restaurant?.logo && (
            <img
              src={restaurant.logo}
              alt={restaurant.name}
              className="w-10 h-10 rounded-full object-cover"
            />
          )}
          <span className="font-bold text-lg text-gray-900">
            {restaurant?.name ?? params.slug}
          </span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
