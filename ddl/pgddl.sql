CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS spwebhookendpoint;
CREATE TABLE IF NOT EXISTS spwebhookendpoint.batches
(
  id SERIAL PRIMARY KEY,
  batch_uuid uuid NOT NULL DEFAULT gen_random_uuid(),
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  batch JSON NOT NULL
);
