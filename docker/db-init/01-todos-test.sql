-- Dev only (mounted by compose.override.yaml): the database the API tests use.
-- Runs once, when the todos-data volume is first initialised.
CREATE DATABASE todos_test;
