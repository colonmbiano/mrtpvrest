type ImageLikeProduct = {
  name?: string | null;
  description?: string | null;
  imageUrl?: string | null;
};

type ImageLikeCategory = {
  name?: string | null;
  imageUrl?: string | null;
  items?: ImageLikeProduct[] | null;
};

const FOOD_IMAGES = {
  burger: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80',
  wings: 'https://images.unsplash.com/photo-1608039755401-742074f0548d?auto=format&fit=crop&w=900&q=80',
  fries: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=900&q=80',
  tacos: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=900&q=80',
  burrito: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=900&q=80',
  nachos: 'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?auto=format&fit=crop&w=900&q=80',
  hotdog: 'https://images.unsplash.com/photo-1612392062631-94dd858cba88?auto=format&fit=crop&w=900&q=80',
  dessert: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=900&q=80',
  frappe: 'https://images.unsplash.com/photo-1505252585461-04db1eb84625?auto=format&fit=crop&w=900&q=80',
  coffee: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80',
  cocktail: 'https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=900&q=80',
  beer: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?auto=format&fit=crop&w=900&q=80',
  soda: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=900&q=80',
  default: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80',
} as const;

const IMAGE_RULES: Array<[RegExp, string]> = [
  [/hamburg|burger|burguer|angus|kfc|atomica|hawa/i, FOOD_IMAGES.burger],
  [/boneless|alita|wing|pollo/i, FOOD_IMAGES.wings],
  [/papas?|francesa|fritas?|gajo|salchipapa|dedos de queso|aros de cebolla/i, FOOD_IMAGES.fries],
  [/taco|volcan|pastor|suadero|tripa|bisteck|arrachera|campechan|chuleta|longaniza/i, FOOD_IMAGES.tacos],
  [/burrito/i, FOOD_IMAGES.burrito],
  [/gringa|sincronizada|quesad/i, FOOD_IMAGES.tacos],
  [/nacho/i, FOOD_IMAGES.nachos],
  [/hot ?dog|salchich/i, FOOD_IMAGES.hotdog],
  [/postre|pastel|cake|cheesecake|pay|pinguino|helad|dulce/i, FOOD_IMAGES.dessert],
  [/frapp|smoothie|licuad|leche saborizada|uvas/i, FOOD_IMAGES.frappe],
  [/cafe|capuch|moka|espresso|te\b/i, FOOD_IMAGES.coffee],
  [/mojito|pina colada|caribe|san juan|sky preparada|preparada|cocktail|coctel/i, FOOD_IMAGES.cocktail],
  [/michelada|cerveza|caguama|heineken|beer|chela/i, FOOD_IMAGES.beer],
  [/refresco|coca|boing|jarrito|agua|mineral|soda|bebida|jugo/i, FOOD_IMAGES.soda],
  [/promo|combo/i, FOOD_IMAGES.burger],
];

function cleanUrl(url?: string | null) {
  const value = typeof url === 'string' ? url.trim() : '';
  return value || null;
}

function fallbackImageForText(text: string) {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [pattern, url] of IMAGE_RULES) {
    if (pattern.test(normalized)) return url;
  }
  return FOOD_IMAGES.default;
}

export function productImageUrl(product: ImageLikeProduct, categoryName?: string | null) {
  const direct = cleanUrl(product.imageUrl);
  if (direct) return direct;

  const text = [product.name, product.description, categoryName].filter(Boolean).join(' ');
  return fallbackImageForText(text);
}

export function categoryImageUrl(category: ImageLikeCategory) {
  const direct = cleanUrl(category.imageUrl);
  if (direct) return direct;

  const firstProductImage = category.items?.map((item) => cleanUrl(item.imageUrl)).find(Boolean);
  if (firstProductImage) return firstProductImage;

  return fallbackImageForText(category.name || '');
}

export function withFallbackStoreImages(menu: any) {
  return {
    ...menu,
    categories: (menu?.categories || []).map((category: any) => ({
      ...category,
      imageUrl: categoryImageUrl(category),
      items: (category.items || []).map((item: any) => ({
        ...item,
        imageUrl: productImageUrl(item, category.name),
      })),
    })),
  };
}
