CREATE TABLE sales (
    id SERIAL PRIMARY KEY,
    total_amount NUMERIC(10,2) NOT NULL,
    product_type VARCHAR(50) NOT NULL,
    region VARCHAR(50) NOT NULL,
    sale_date DATE NOT NULL
);

INSERT INTO sales (total_amount,product_type,region,sale_date)

SELECT
    ROUND((random() * 490 + 10)::numeric,2),
    (ARRAY['Electronics','Clothing','Food','Furniture','Sports'])[floor(random()*5+1)::int],
    (ARRAY['North','South','East','West'])[floor(random()*4+1)::int],
    DATE '2024-01-01' + (random() * 730)::int
FROM generate_series(1,10000);