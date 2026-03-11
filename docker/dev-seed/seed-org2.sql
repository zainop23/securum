CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    amount NUMERIC(10,2) NOT NULL,
    category VARCHAR(50) NOT NULL,
    area VARCHAR(50) NOT NULL,
    order_date DATE NOT NULL
);

INSERT INTO orders (amount,category,area,order_date)

SELECT
    ROUND((random() * 490 + 10)::numeric,2),
    (ARRAY['Electronics','Clothing','Food','Furniture','Sports'])[floor(random()*5+1)::int],
    (ARRAY['North','South','East','West'])[floor(random()*4+1)::int],
    DATE '2024-01-01' + (random() * 730)::int
FROM generate_series(1,10000);