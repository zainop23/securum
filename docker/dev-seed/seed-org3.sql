CREATE TABLE purchases (
    id SERIAL PRIMARY KEY,
    price NUMERIC(10,2) NOT NULL,
    item_class VARCHAR(50) NOT NULL,
    location VARCHAR(50) NOT NULL,
    purchase_date DATE NOT NULL
);

INSERT INTO purchases (price,item_class,location,purchase_date)

SELECT
    ROUND((random() * 490 + 10)::numeric,2),
    (ARRAY['Electronics','Clothing','Food','Furniture','Sports'])[floor(random()*5+1)::int],
    (ARRAY['North','South','East','West'])[floor(random()*4+1)::int],
    DATE '2024-01-01' + (random() * 730)::int
FROM generate_series(1,10000);