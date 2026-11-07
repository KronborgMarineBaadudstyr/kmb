-- Migration 059: Salgsanalyse + AI-samtaler
-- Kør efter 058. Bruges af /admin/insights (dashboard) og /admin/ai (AI-assistent) via service role.
-- Beløb er som i ordrerne (salgspriser inkl. moms). Indkøbspriser (product_suppliers) er ekskl. moms.

-- ── Alle solgte ordrelinjer, fladet ud ────────────────────────────────────────────
-- family_id: varianter, der er lagt ind under et overprodukt, tælles med overproduktet.
CREATE OR REPLACE VIEW sales_lines WITH (security_invoker = true) AS
SELECT
  o.id                                         AS order_id,
  o.order_number,
  o.source,
  o.shop_user_id,
  o.ordered_at,
  p.id                                         AS product_id,
  COALESCE(pp.id, p.id)                        AS family_id,
  COALESCE(NULLIF(li->>'name', ''), p.name)    AS line_name,
  CASE WHEN li->>'qty' ~ '^\d+$' THEN (li->>'qty')::int ELSE 1 END AS qty,
  CASE WHEN li->>'price' ~ '^-?\d+(\.\d+)?$' THEN (li->>'price')::numeric END AS unit_price,
  COALESCE(
    CASE WHEN li->>'line_total' ~ '^-?\d+(\.\d+)?$' THEN (li->>'line_total')::numeric END,
    CASE WHEN li->>'price' ~ '^-?\d+(\.\d+)?$' THEN (li->>'price')::numeric END
      * CASE WHEN li->>'qty' ~ '^\d+$' THEN (li->>'qty')::int ELSE 1 END
  )                                            AS revenue,
  COALESCE(pp.categories[1], p.categories[1])  AS category,
  COALESCE(pp.brand, p.brand)                  AS brand
FROM orders o
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(o.line_items) = 'array' THEN o.line_items ELSE '[]'::jsonb END
) li
JOIN products p       ON p.id::text = li->>'product_id'
LEFT JOIN products pp ON pp.id = p.variant_of_product_id
WHERE o.status NOT IN ('cancelled', 'refunded');

-- ── Hvor meget data er der? ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics_coverage()
RETURNS TABLE(first_order timestamptz, last_order timestamptz, orders bigint, lines bigint, units bigint,
              customers bigint, products_sold bigint, price_changes bigint, orders_by_source jsonb)
LANGUAGE sql STABLE AS $$
  SELECT min(ordered_at), max(ordered_at), count(DISTINCT order_id), count(*), coalesce(sum(qty), 0),
         count(DISTINCT shop_user_id), count(DISTINCT family_id),
         (SELECT count(*) FROM price_history WHERE old_value IS NOT NULL),
         (SELECT coalesce(jsonb_object_agg(source, n), '{}'::jsonb)
            FROM (SELECT source, count(DISTINCT order_id) AS n FROM sales_lines GROUP BY source) s)
  FROM sales_lines
$$;

-- ── Topsælgere i en periode ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics_top_products(p_from timestamptz, p_to timestamptz,
                                                  p_category text DEFAULT NULL, p_limit int DEFAULT 20)
RETURNS TABLE(product_id uuid, name text, category text, qty bigint, revenue numeric, orders bigint, avg_price numeric)
LANGUAGE sql STABLE AS $$
  SELECT s.family_id, p.name, max(s.category), sum(s.qty), round(sum(s.revenue), 2),
         count(DISTINCT s.order_id), round(sum(s.revenue) / nullif(sum(s.qty), 0), 2)
  FROM sales_lines s JOIN products p ON p.id = s.family_id
  WHERE s.ordered_at >= p_from AND s.ordered_at < p_to
    AND (p_category IS NULL OR s.category = p_category)
  GROUP BY s.family_id, p.name
  ORDER BY sum(s.revenue) DESC NULLS LAST, sum(s.qty) DESC
  LIMIT p_limit
$$;

-- ── Salg pr. måned (produkt, kategori eller alt) ──────────────────────────────────
CREATE OR REPLACE FUNCTION analytics_monthly(p_product uuid DEFAULT NULL, p_category text DEFAULT NULL,
                                             p_months int DEFAULT 24)
RETURNS TABLE(month date, qty bigint, revenue numeric, orders bigint, avg_unit_price numeric)
LANGUAGE sql STABLE AS $$
  SELECT date_trunc('month', ordered_at)::date, sum(qty), round(sum(revenue), 2), count(DISTINCT order_id),
         round(sum(revenue) / nullif(sum(qty), 0), 2)
  FROM sales_lines
  WHERE ordered_at >= date_trunc('month', now()) - make_interval(months => greatest(p_months, 1) - 1)
    AND (p_product IS NULL OR family_id = p_product)
    AND (p_category IS NULL OR category = p_category)
  GROUP BY 1 ORDER BY 1
$$;

-- ── Sæsonmønster: andel af årets salg pr. kalendermåned (alle år lagt sammen) ─────
CREATE OR REPLACE FUNCTION analytics_seasonality(p_product uuid DEFAULT NULL, p_category text DEFAULT NULL)
RETURNS TABLE(month_of_year int, qty bigint, revenue numeric, years_with_sales bigint, share numeric)
LANGUAGE sql STABLE AS $$
  WITH s AS (
    SELECT extract(month FROM ordered_at)::int AS m, extract(year FROM ordered_at)::int AS y, qty, revenue
    FROM sales_lines
    WHERE (p_product IS NULL OR family_id = p_product) AND (p_category IS NULL OR category = p_category)
  )
  SELECT m, sum(qty), round(sum(revenue), 2), count(DISTINCT y),
         round(sum(qty)::numeric / nullif((SELECT sum(qty) FROM s), 0), 3)
  FROM s GROUP BY m ORDER BY m
$$;

-- ── Købes sammen (samme ordre) ────────────────────────────────────────────────────
-- confidence = andel af ordrer med A, der også har B. lift > 1 = oftere sammen end tilfældigt.
CREATE OR REPLACE FUNCTION analytics_bought_together(p_product uuid DEFAULT NULL, p_limit int DEFAULT 15,
                                                     p_min_orders int DEFAULT 2)
RETURNS TABLE(product_a uuid, name_a text, product_b uuid, name_b text, orders_together bigint,
              orders_a bigint, orders_b bigint, confidence numeric, lift numeric)
LANGUAGE sql STABLE AS $$
  WITH baskets AS (SELECT DISTINCT order_id, family_id FROM sales_lines),
  total AS (SELECT count(DISTINCT order_id)::numeric AS n FROM baskets),
  cnt AS (SELECT family_id, count(*) AS c FROM baskets GROUP BY family_id),
  pairs AS (
    SELECT a.family_id AS pa, b.family_id AS pb, count(*) AS together
    FROM baskets a JOIN baskets b ON a.order_id = b.order_id AND a.family_id <> b.family_id
    WHERE (p_product IS NULL AND a.family_id < b.family_id) OR a.family_id = p_product
    GROUP BY 1, 2 HAVING count(*) >= p_min_orders
  )
  SELECT pa, a.name, pb, b.name, together, ca.c, cb.c,
         round(together::numeric / ca.c, 3),
         round(together * total.n / (ca.c * cb.c), 2)
  FROM pairs
  JOIN cnt ca ON ca.family_id = pa JOIN cnt cb ON cb.family_id = pb
  JOIN products a ON a.id = pa JOIN products b ON b.id = pb
  CROSS JOIN total
  ORDER BY together DESC, 9 DESC
  LIMIT p_limit
$$;

-- ── Kategorier der købes af de samme kunder ───────────────────────────────────────
-- Kunde = shop_user_id; ordrer uden kunde tælles som hver deres kunde.
CREATE OR REPLACE FUNCTION analytics_category_affinity(p_category text DEFAULT NULL, p_limit int DEFAULT 15)
RETURNS TABLE(category_a text, category_b text, customers_both bigint, customers_a bigint, customers_b bigint,
              confidence numeric, lift numeric)
LANGUAGE sql STABLE AS $$
  WITH cc AS (
    SELECT DISTINCT coalesce(shop_user_id::text, 'o:' || order_id::text) AS ck, category
    FROM sales_lines WHERE category IS NOT NULL
  ),
  total AS (SELECT count(DISTINCT ck)::numeric AS n FROM cc),
  cnt AS (SELECT category, count(*) AS c FROM cc GROUP BY category),
  pairs AS (
    SELECT a.category AS ca, b.category AS cb, count(*) AS both_
    FROM cc a JOIN cc b ON a.ck = b.ck AND a.category <> b.category
    WHERE (p_category IS NULL AND a.category < b.category) OR a.category = p_category
    GROUP BY 1, 2
  )
  SELECT ca, cb, both_, x.c, y.c, round(both_::numeric / x.c, 3), round(both_ * total.n / (x.c * y.c), 2)
  FROM pairs JOIN cnt x ON x.category = ca JOIN cnt y ON y.category = cb CROSS JOIN total
  ORDER BY both_ DESC, 7 DESC
  LIMIT p_limit
$$;

-- ── Realiseret pris og salg pr. måned for ét produkt (grundlag for prisfølsomhed) ──
CREATE OR REPLACE FUNCTION analytics_price_monthly(p_product uuid)
RETURNS TABLE(month date, qty bigint, orders bigint, avg_unit_price numeric, min_unit_price numeric, max_unit_price numeric)
LANGUAGE sql STABLE AS $$
  SELECT date_trunc('month', ordered_at)::date, sum(qty), count(DISTINCT order_id),
         round(sum(revenue) / nullif(sum(qty), 0), 2), min(unit_price), max(unit_price)
  FROM sales_lines WHERE family_id = p_product
  GROUP BY 1 ORDER BY 1
$$;

-- ── Salg før og efter hver prisændring ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics_price_changes(p_product uuid, p_days int DEFAULT 60)
RETURNS TABLE(changed_at timestamptz, field text, old_value numeric, new_value numeric,
              qty_before bigint, qty_after bigint, days_after numeric)
LANGUAGE sql STABLE AS $$
  SELECT h.changed_at, h.field, h.old_value, h.new_value,
    (SELECT coalesce(sum(s.qty), 0) FROM sales_lines s WHERE s.family_id = p_product
       AND s.ordered_at >= h.changed_at - make_interval(days => p_days) AND s.ordered_at < h.changed_at),
    (SELECT coalesce(sum(s.qty), 0) FROM sales_lines s WHERE s.family_id = p_product
       AND s.ordered_at >= h.changed_at AND s.ordered_at < h.changed_at + make_interval(days => p_days)),
    round(least(p_days::numeric, extract(epoch FROM now() - h.changed_at) / 86400), 1)
  FROM price_history h
  WHERE (h.product_id = p_product OR h.product_id IN (SELECT id FROM products WHERE variant_of_product_id = p_product))
    AND h.old_value IS NOT NULL
  ORDER BY h.changed_at
$$;

-- ── Kampagner: salg under kampagnen vs. lige så lang periode før ──────────────────
CREATE OR REPLACE FUNCTION analytics_campaigns(p_limit int DEFAULT 20)
RETURNS TABLE(campaign_id uuid, name text, type text, discount_type text, discount_value numeric,
              start_date date, end_date date, products bigint, qty_during bigint, qty_before bigint,
              revenue_during numeric, revenue_before numeric)
LANGUAGE sql STABLE AS $$
  WITH c AS (
    SELECT c.*, coalesce(c.end_date, current_date) AS stop,
           (coalesce(c.end_date, current_date) - c.start_date + 1) AS len
    FROM campaigns c WHERE c.start_date IS NOT NULL AND c.start_date <= current_date
  ),
  s AS (
    SELECT c.id, sl.qty, sl.revenue,
           sl.ordered_at >= c.start_date AND sl.ordered_at < c.stop + 1 AS during
    FROM c
    JOIN campaign_products cp ON cp.campaign_id = c.id
    JOIN sales_lines sl ON (sl.product_id = cp.product_id OR sl.family_id = cp.product_id)
     AND sl.ordered_at >= c.start_date - c.len AND sl.ordered_at < c.stop + 1
  )
  SELECT c.id, c.name, c.type, c.discount_type, c.discount_value, c.start_date, c.end_date,
         (SELECT count(*) FROM campaign_products cp WHERE cp.campaign_id = c.id),
         coalesce(sum(s.qty) FILTER (WHERE s.during), 0), coalesce(sum(s.qty) FILTER (WHERE NOT s.during), 0),
         round(coalesce(sum(s.revenue) FILTER (WHERE s.during), 0), 2),
         round(coalesce(sum(s.revenue) FILTER (WHERE NOT s.during), 0), 2)
  FROM c LEFT JOIN s ON s.id = c.id
  GROUP BY c.id, c.name, c.type, c.discount_type, c.discount_value, c.start_date, c.end_date
  ORDER BY c.start_date DESC
  LIMIT p_limit
$$;

-- ── Hvor mange stk. køber kunderne ad gangen? (til pakke-simulering) ──────────────
CREATE OR REPLACE FUNCTION analytics_order_qty(p_product uuid, p_months int DEFAULT 24)
RETURNS TABLE(qty_per_order int, orders bigint)
LANGUAGE sql STABLE AS $$
  SELECT q, count(*) FROM (
    SELECT order_id, sum(qty)::int AS q FROM sales_lines
    WHERE family_id = p_product
      AND ordered_at >= now() - make_interval(months => greatest(p_months, 1))
    GROUP BY order_id
  ) x GROUP BY q ORDER BY q
$$;

-- ── AI-samtaler ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  title         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_admin ON ai_conversations(admin_user_id, updated_at DESC);

-- content = Anthropic content blocks (tekst, tool_use, tool_result), så samtalen kan fortsættes
CREATE TABLE IF NOT EXISTS ai_messages (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id, id);

-- ── Rettigheder: kun service role ─────────────────────────────────────────────────
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages      ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sales_lines, ai_conversations, ai_messages FROM anon, authenticated;
GRANT SELECT ON sales_lines TO service_role;
GRANT ALL ON ai_conversations, ai_messages TO service_role;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'analytics_coverage()',
    'analytics_top_products(timestamptz, timestamptz, text, int)',
    'analytics_monthly(uuid, text, int)',
    'analytics_seasonality(uuid, text)',
    'analytics_bought_together(uuid, int, int)',
    'analytics_category_affinity(text, int)',
    'analytics_price_monthly(uuid)',
    'analytics_price_changes(uuid, int)',
    'analytics_campaigns(int)',
    'analytics_order_qty(uuid, int)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
