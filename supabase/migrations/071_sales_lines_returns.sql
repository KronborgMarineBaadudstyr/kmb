-- Migration 071: Salgsanalysen tæller returer og decimalantal korrekt
-- sales_lines læste kun antal som hele, positive tal ('^\d+$'). Returlinjer (antal -1) blev derfor talt som +1 solgt,
-- og 2,5 m tovværk som 1. Nu: negative og decimale antal læses (antal afrundes til helt tal; omsætning er eksakt).
-- Bruges især af importerede kassesalg (source 'pos'), hvor returer er linjer med negativt antal.
-- Kolonnerne er uændrede (qty er stadig int), så analytics_*()-funktionerne virker som før.

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
  CASE WHEN li->>'qty' ~ '^-?\d+(\.\d+)?$' THEN round((li->>'qty')::numeric)::int ELSE 1 END AS qty,
  CASE WHEN li->>'price' ~ '^-?\d+(\.\d+)?$' THEN (li->>'price')::numeric END AS unit_price,
  COALESCE(
    CASE WHEN li->>'line_total' ~ '^-?\d+(\.\d+)?$' THEN (li->>'line_total')::numeric END,
    CASE WHEN li->>'price' ~ '^-?\d+(\.\d+)?$' THEN (li->>'price')::numeric END
      * CASE WHEN li->>'qty' ~ '^-?\d+(\.\d+)?$' THEN (li->>'qty')::numeric ELSE 1 END
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
