CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 90),
  category TEXT NOT NULL CHECK (category IN ('charging', 'cables', 'accessories')),
  sku TEXT,
  detail TEXT NOT NULL CHECK (length(trim(detail)) BETWEEN 2 AND 180),
  brand TEXT,
  compatibility TEXT,
  price_ngn REAL CHECK (price_ngn IS NULL OR price_ngn >= 0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0, 1)),
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  image_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (name COLLATE NOCASE)
);

CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique
  ON products (sku COLLATE NOCASE) WHERE sku IS NOT NULL AND trim(sku) <> '';
CREATE INDEX IF NOT EXISTS products_catalog_order
  ON products (is_published, category, created_at DESC);

INSERT OR IGNORE INTO products
  (id,name,category,detail,image_url,stock_quantity,price_ngn)
VALUES
 ('legacy-01','Everyday charging set','charging','A handy mix of chargers and cables','https://roslaan001.github.io/aa-digital-world/assets/product-11.jpeg',0,NULL),
 ('legacy-02','Cable colour collection','cables','Cable options in a range of colours','https://roslaan001.github.io/aa-digital-world/assets/product-08.jpeg',0,NULL),
 ('legacy-03','Phone accessory bundle','accessories','A little bit of everything for your phone','https://roslaan001.github.io/aa-digital-world/assets/product-02.jpeg',0,NULL),
 ('legacy-04','Charging & adapter picks','charging','Adapters and charging accessories','https://roslaan001.github.io/aa-digital-world/assets/product-03.jpeg',0,NULL),
 ('legacy-05','Cable & connector mix','cables','Different cable and connector styles','https://roslaan001.github.io/aa-digital-world/assets/product-10.jpeg',0,NULL),
 ('legacy-06','Mobile essentials bundle','accessories','Useful add-ons for your everyday carry','https://roslaan001.github.io/aa-digital-world/assets/product-05.jpeg',0,NULL),
 ('legacy-07','Power & charging picks','charging','Chargers and leads for daily use','https://roslaan001.github.io/aa-digital-world/assets/product-06.jpeg',0,NULL),
 ('legacy-08','Cable essentials','cables','Browse the available cable selection','https://roslaan001.github.io/aa-digital-world/assets/product-09.jpeg',0,NULL),
 ('legacy-09','Handy gadget selection','accessories','Small tech finds for home and travel','https://roslaan001.github.io/aa-digital-world/assets/product-01.jpeg',0,NULL),
 ('legacy-10','Adapter & audio accessories','accessories','Ask which options work with your device','https://roslaan001.github.io/aa-digital-world/assets/product-07.jpeg',0,NULL),
 ('legacy-11','Phone accessories, assorted','accessories','More useful extras in one collection','https://roslaan001.github.io/aa-digital-world/assets/product-04.jpeg',0,NULL);
