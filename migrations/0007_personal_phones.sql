CREATE TABLE customer_personal_phones (
  customer_no INTEGER PRIMARY KEY REFERENCES customers(customer_no) ON DELETE RESTRICT,
  phone_number TEXT NOT NULL UNIQUE
);
