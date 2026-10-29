-- Rebrand from grocery to clothing store
UPDATE settings SET store_name = 'StyleBazaar', store_email = 'info@stylebazaar.com', receipt_footer = 'Thank you for shopping with StyleBazaar!' WHERE store_name = 'FreshMart Grocery';

INSERT INTO settings (store_name, store_email, store_phone, store_address, currency, currency_symbol, tax_rate, receipt_footer)
SELECT 'StyleBazaar', 'info@stylebazaar.com', '+880 1700-000000', '123 Fashion Street, Dhaka', 'BDT', '৳', 5, 'Thank you for shopping with StyleBazaar!'
WHERE NOT EXISTS (SELECT 1 FROM settings);

-- Clothing categories
INSERT INTO categories (name, description, status) VALUES
  ('Shirts', 'Formal and casual shirts', 'active'),
  ('T-Shirts', 'Polo and t-shirts', 'active'),
  ('Pants', 'Trousers and chinos', 'active'),
  ('Jeans', 'Denim jeans', 'active'),
  ('Panjabi', 'Traditional panjabi', 'active'),
  ('Hoodies', 'Hoodies and sweatshirts', 'active'),
  ('Jackets', 'Jackets and blazers', 'active'),
  ('Accessories', 'Belts, caps, socks', 'active')
ON CONFLICT DO NOTHING;

-- Clothing brands
INSERT INTO brands (name, description, status) VALUES
  ('Aarong', 'Bangladeshi premium fashion brand', 'active'),
  ('Yellow', 'Casual fashion brand', 'active'),
  ('Easy', 'Affordable everyday fashion', 'active'),
  ('Levis', 'Denim and jeans specialist', 'active'),
  ('Raymond', 'Formal wear specialist', 'active'),
  ('Cats Eye', 'Trendy fashion brand', 'active')
ON CONFLICT DO NOTHING;

-- Clothing products
INSERT INTO products (name, sku, brand_id, category_id, description, cost_price, selling_price, discount_price, unit, tax_rate, stock, min_stock, status)
SELECT v.name, v.sku, b.id, c.id, v.description, v.cost_price, v.selling_price, v.discount_price, 'pcs', 0, v.stock, v.min_stock, 'active'
FROM (VALUES
  ('Casual Cotton Shirt', 'SH-001', 'Aarong', 'Shirts', 'Comfortable cotton casual shirt', 450, 890, NULL::numeric, 50, 10),
  ('Formal Oxford Shirt', 'SH-002', 'Raymond', 'Shirts', 'Premium oxford formal shirt', 650, 1290, 990, 35, 10),
  ('Slim Fit Dress Shirt', 'SH-003', 'Yellow', 'Shirts', 'Slim fit dress shirt for office', 550, 1090, NULL::numeric, 40, 10),
  ('Linen Casual Shirt', 'SH-004', 'Easy', 'Shirts', 'Breathable linen casual shirt', 380, 750, NULL::numeric, 60, 10),
  ('Classic Polo T-Shirt', 'TS-001', 'Aarong', 'T-Shirts', 'Classic polo t-shirt', 350, 690, NULL::numeric, 80, 15),
  ('Graphic Print T-Shirt', 'TS-002', 'Cats Eye', 'T-Shirts', 'Trendy graphic print t-shirt', 280, 550, 450, 100, 15),
  ('V-Neck T-Shirt', 'TS-003', 'Easy', 'T-Shirts', 'Basic v-neck cotton t-shirt', 220, 450, NULL::numeric, 120, 20),
  ('Striped Polo Shirt', 'TS-004', 'Yellow', 'T-Shirts', 'Striped polo shirt', 380, 750, NULL::numeric, 55, 10),
  ('Slim Fit Chino Pants', 'PT-001', 'Yellow', 'Pants', 'Slim fit chino pants', 650, 1290, NULL::numeric, 45, 10),
  ('Formal Dress Pants', 'PT-002', 'Raymond', 'Pants', 'Formal dress pants for office', 750, 1490, 1190, 30, 10),
  ('Casual Cargo Pants', 'PT-003', 'Easy', 'Pants', 'Casual cargo pants with pockets', 580, 1150, NULL::numeric, 50, 10),
  ('Slim Fit Jeans', 'JN-001', 'Levis', 'Jeans', 'Slim fit denim jeans', 950, 1890, NULL::numeric, 70, 15),
  ('Straight Fit Jeans', 'JN-002', 'Levis', 'Jeans', 'Classic straight fit jeans', 890, 1750, 1450, 65, 15),
  ('Skinny Jeans', 'JN-003', 'Cats Eye', 'Jeans', 'Trendy skinny fit jeans', 780, 1550, NULL::numeric, 40, 10),
  ('Cotton Panjabi', 'PJ-001', 'Aarong', 'Panjabi', 'Traditional cotton panjabi', 550, 1090, NULL::numeric, 60, 15),
  ('Silk Panjabi', 'PJ-002', 'Aarong', 'Panjabi', 'Premium silk panjabi for occasions', 850, 1690, 1390, 35, 10),
  ('Embroidered Panjabi', 'PJ-003', 'Yellow', 'Panjabi', 'Embroidered festive panjabi', 750, 1490, NULL::numeric, 45, 10),
  ('Casual Panjabi', 'PJ-004', 'Easy', 'Panjabi', 'Everyday casual panjabi', 380, 750, NULL::numeric, 80, 15),
  ('Pullover Hoodie', 'HD-001', 'Cats Eye', 'Hoodies', 'Warm pullover hoodie', 650, 1290, NULL::numeric, 50, 10),
  ('Zip-Up Hoodie', 'HD-002', 'Yellow', 'Hoodies', 'Zip-up hoodie with pockets', 680, 1350, 1090, 40, 10),
  ('Crew Neck Sweatshirt', 'HD-003', 'Easy', 'Hoodies', 'Comfortable crew neck sweatshirt', 550, 1090, NULL::numeric, 55, 10),
  ('Denim Jacket', 'JK-001', 'Levis', 'Jackets', 'Classic denim jacket', 1150, 2290, NULL::numeric, 30, 5),
  ('Blazer', 'JK-002', 'Raymond', 'Jackets', 'Formal blazer for office', 1450, 2890, 2490, 25, 5),
  ('Bomber Jacket', 'JK-003', 'Cats Eye', 'Jackets', 'Trendy bomber jacket', 990, 1990, NULL::numeric, 35, 5),
  ('Leather Belt', 'AC-001', 'Raymond', 'Accessories', 'Genuine leather belt', 350, 690, NULL::numeric, 100, 20),
  ('Cotton Cap', 'AC-002', 'Cats Eye', 'Accessories', 'Stylish cotton cap', 180, 350, NULL::numeric, 150, 20),
  ('Ankle Socks Pack 3', 'AC-003', 'Easy', 'Accessories', 'Cotton ankle socks pack of 3', 120, 250, NULL::numeric, 200, 30),
  ('Wrist Watch', 'AC-004', 'Cats Eye', 'Accessories', 'Stylish analog wrist watch', 850, 1690, 1390, 40, 5)
) AS v(name, sku, brand, category, description, cost_price, selling_price, discount_price, stock, min_stock)
JOIN brands b ON b.name = v.brand
JOIN categories c ON c.name = v.category
ON CONFLICT (sku) DO NOTHING;

-- Expense categories
INSERT INTO expense_categories (name, description) VALUES
  ('Rent', 'Shop rent'),
  ('Utilities', 'Electricity, water, internet'),
  ('Salaries', 'Employee salaries'),
  ('Marketing', 'Advertising and promotions'),
  ('Supplies', 'Office and packaging supplies'),
  ('Transportation', 'Delivery and transportation')
ON CONFLICT DO NOTHING;
