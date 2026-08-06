INSERT OR IGNORE INTO gl_accounts (code, name, type, parent_id, description, is_active)
VALUES (
  '3205',
  'Inventory Adjustment Offset',
  'Equity',
  NULL,
  'Offset for non-revenue inventory additions and opening stock counts',
  1
);

UPDATE journal_lines
   SET gl_account_id = (SELECT id FROM gl_accounts WHERE code = '3205')
 WHERE source_table = 'inventory_adjustments'
   AND drcr = 'C'
   AND gl_account_id IN (
     SELECT id
       FROM gl_accounts
      WHERE type = 'Revenue'
        AND (code = '4700' OR lower(name) = 'inventory revenue')
   )
   AND source_id IN (
     SELECT id
       FROM inventory_adjustments
      WHERE qty_delta > 0
   );
