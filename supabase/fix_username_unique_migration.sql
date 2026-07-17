-- ============================================================
-- Migration: fix username uniqueness bug
-- Run this in Supabase SQL Editor
-- ============================================================
--
-- Why this exists: user_preferences.username is UNIQUE, but every new user
-- gets username = '' (empty string) by default. Empty string counts as a
-- real value for uniqueness in Postgres, so as soon as a second account also
-- has a blank username, saving fails with a 409 conflict. NULL doesn't have
-- this problem — Postgres allows unlimited NULLs in a unique column. This
-- converts existing blank usernames to NULL so saving works again.

update public.user_preferences set username = null where username = '';
