-- Example seed data for the items table.
-- Run manually against your database if you want a starter menu:
--   psql "$DATABASE_URL" -f seed.example.sql

INSERT INTO items (name, price, category, sort_order) VALUES
  ('Cheeseburger',  8.5, 'Food',     1),
  ('Hot Dog',       5.0, 'Food',     2),
  ('Fries',         4.0, 'Food',     3),
  ('Caesar Salad',  7.0, 'Food',     4),
  ('Cola',          3.0, 'Drinks',   5),
  ('Lemonade',      3.5, 'Drinks',   6),
  ('Water',         2.0, 'Drinks',   7),
  ('Coffee',        3.0, 'Drinks',   8),
  ('Brownie',       4.0, 'Desserts', 9),
  ('Ice Cream',     3.5, 'Desserts', 10);
