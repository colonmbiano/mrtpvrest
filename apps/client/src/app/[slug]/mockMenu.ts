// Mock catalog para FASE 3.
// El catálogo real se conecta en una fase posterior via /api/store/menu.

export type MockProduct = {
  id: string;
  name: string;
  description?: string;
  price: number;
  image?: string;
};

export type MockCategory = {
  id: string;
  name: string;
  emoji: string;
  items: MockProduct[];
};

export const MOCK_CATEGORIES: MockCategory[] = [
  {
    id: 'cat-burgers',
    name: 'Burgers',
    emoji: '🍔',
    items: [
      {
        id: 'burger-master',
        name: 'Master Burger',
        description: 'Doble carne, queso cheddar, tocino y salsa de la casa.',
        price: 120,
        image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80',
      },
      {
        id: 'burger-classic',
        name: 'Classic Burger',
        description: 'Carne de res, lechuga, tomate y cebolla caramelizada.',
        price: 95,
        image: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=800&q=80',
      },
      {
        id: 'burger-bbq',
        name: 'BBQ Smoke',
        description: 'Carne ahumada, cheddar, aros de cebolla y salsa BBQ.',
        price: 135,
        image: 'https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?w=800&q=80',
      },
    ],
  },
  {
    id: 'cat-alitas',
    name: 'Alitas',
    emoji: '🍗',
    items: [
      {
        id: 'alitas-buffalo',
        name: 'Alitas Buffalo',
        description: '8 piezas bañadas en salsa buffalo clásica.',
        price: 140,
        image: 'https://images.unsplash.com/photo-1608039755401-742074f0548d?w=800&q=80',
      },
      {
        id: 'alitas-bbq',
        name: 'Alitas BBQ',
        description: '8 piezas con salsa BBQ ahumada.',
        price: 140,
        image: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=800&q=80',
      },
      {
        id: 'alitas-mango',
        name: 'Alitas Mango Habanero',
        description: '8 piezas dulce-picante con chile habanero.',
        price: 150,
        image: 'https://images.unsplash.com/photo-1562967916-eb82221dfb92?w=800&q=80',
      },
    ],
  },
  {
    id: 'cat-bebidas',
    name: 'Bebidas',
    emoji: '🥤',
    items: [
      {
        id: 'bebida-refresco',
        name: 'Refresco 600ml',
        price: 30,
      },
      {
        id: 'bebida-agua',
        name: 'Agua natural 500ml',
        price: 20,
      },
    ],
  },
];
