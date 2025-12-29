#!/usr/bin/env npx tsx
/**
 * Seed script - creates demo data via the API
 * 
 * Usage:
 *   npx tsx scripts/seed.ts <api_url> <admin_key>
 *   npx tsx scripts/seed.ts http://localhost:8787 sk_...
 */

const API_URL = process.argv[2] || 'http://localhost:8787';
const API_KEY = process.argv[3];

if (!API_KEY) {
  console.log(`
🌱 Seed Script - Create demo data

Usage:
  npx tsx scripts/seed.ts <api_url> <admin_key>

Example:
  npx tsx scripts/seed.ts http://localhost:8787 sk_abc123...

First, start the API and create a store:
  npm run dev
  # Then in browser or curl, the first request will prompt you to set up
`);
  process.exit(1);
}

async function api(path: string, body?: any) {
  const res = await fetch(`${API_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`${path}: ${err.error?.message || res.statusText}`);
  }

  return res.json();
}

async function seed() {
  console.log('🌱 Seeding demo data...\n');

  // Products
  const products = [
    { title: 'Classic Tee', description: 'Premium cotton t-shirt' },
    { title: 'Hoodie', description: 'Cozy pullover hoodie' },
    { title: 'Cap', description: 'Embroidered baseball cap' },
  ];

  const variants: Record<string, any[]> = {
    'Classic Tee': [
      { sku: 'TEE-BLK-S', title: 'Black / S', price_cents: 2999, weight_g: 180, stock: 50 },
      { sku: 'TEE-BLK-M', title: 'Black / M', price_cents: 2999, weight_g: 200, stock: 75 },
      { sku: 'TEE-BLK-L', title: 'Black / L', price_cents: 2999, weight_g: 220, stock: 60 },
      { sku: 'TEE-WHT-S', title: 'White / S', price_cents: 2999, weight_g: 180, stock: 40 },
      { sku: 'TEE-WHT-M', title: 'White / M', price_cents: 2999, weight_g: 200, stock: 55 },
      { sku: 'TEE-WHT-L', title: 'White / L', price_cents: 2999, weight_g: 220, stock: 45 },
    ],
    'Hoodie': [
      { sku: 'HOOD-BLK-M', title: 'Black / M', price_cents: 5999, weight_g: 450, stock: 30 },
      { sku: 'HOOD-BLK-L', title: 'Black / L', price_cents: 5999, weight_g: 500, stock: 25 },
      { sku: 'HOOD-GRY-M', title: 'Gray / M', price_cents: 5999, weight_g: 450, stock: 20 },
      { sku: 'HOOD-GRY-L', title: 'Gray / L', price_cents: 5999, weight_g: 500, stock: 15 },
    ],
    'Cap': [
      { sku: 'CAP-BLK', title: 'Black', price_cents: 2499, weight_g: 100, stock: 100 },
      { sku: 'CAP-NVY', title: 'Navy', price_cents: 2499, weight_g: 100, stock: 80 },
    ],
  };

  for (const prod of products) {
    console.log(`📦 Creating ${prod.title}...`);
    
    const product = await api('/v1/products', prod);
    
    for (const v of variants[prod.title]) {
      const { stock, ...variant } = v;
      console.log(`   └─ ${variant.sku}`);
      
      await api(`/v1/products/${product.id}/variants`, variant);
      
      // Add inventory
      await api(`/v1/inventory/${encodeURIComponent(variant.sku)}/adjust`, {
        delta: stock,
        reason: 'restock',
      });
    }
  }

  console.log('\n✅ Done! Demo data created.\n');
  
  // Show summary
  const { items: allProducts } = await api('/v1/products');
  console.log(`Products: ${allProducts.length}`);
  console.log(`Variants: ${allProducts.reduce((sum: number, p: any) => sum + p.variants.length, 0)}`);
  
  console.log(`\n📊 Admin dashboard: cd admin && npm run dev`);
  console.log(`   Connect with: ${API_URL}`);
}

seed().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
