CREATE TABLE customers (
  customer_no INTEGER PRIMARY KEY CHECK (customer_no > 0),
  user_id TEXT UNIQUE REFERENCES "user"("id") ON DELETE RESTRICT,
  phone_number TEXT UNIQUE
);

-- Reserve 0001 before assigning numbers to other accounts.
INSERT INTO customers (customer_no) VALUES (1);
