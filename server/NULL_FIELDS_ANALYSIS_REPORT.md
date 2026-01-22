# NULL Fields Analysis Report

**Generated:** 22.1.2026, 9:58:41

---

## Executive Summary

Analysis of 4 NULL columns in the database by examining source XML files from Keshet.

## Detailed Analysis

### 1. branches.bikoret_no

**Current Status:** All 27 rows are NULL

**XML Analysis:**
- Field DOES NOT exist in source XML
- Occurrences in XML: 0

**Recommendation:**
No recommendation

---

### 2. items.category

**Current Status:** All 46,980 rows are NULL

**XML Analysis:**
- Found potential category fields: ItemType
- Found fields: ItemType

**Recommendation:**
Extract category from XML fields: ItemType

---

### 3. prices.unit_price

**Current Status:** All 316,154 rows are NULL

**XML Analysis:**
- Found unit price related fields: UnitOfMeasurePrice, Quantity, UnitOfMeasure
- Found fields: UnitOfMeasurePrice, Quantity, UnitOfMeasure

**Recommendation:**
Calculate unit_price from available fields: UnitOfMeasurePrice, Quantity, UnitOfMeasure

---

### 4. prices.bikoret_no

**Current Status:** All 316,154 rows are NULL

**XML Analysis:**
- BikoretNo exists but likely at store level (header), not per-item/price

**Recommendation:**
Consider removing this column OR populate from branches.bikoret_no via join

---

## Action Items


1. **items.category** (Priority: High)
   - Action: Extract category from XML fields: ItemType
   - File to modify: parser.js


2. **prices.unit_price** (Priority: Medium)
   - Action: Calculate unit_price from available fields: UnitOfMeasurePrice, Quantity, UnitOfMeasure
   - File to modify: parser.js


3. **prices.bikoret_no** (Priority: Low)
   - Action: Consider removing this column OR populate from branches.bikoret_no via join
   - File to modify: Schema migration


---

## Conclusion

0 fields can be populated by updating the parser.
1 fields may not be critical or not available in source data.

**Next Steps:**
1. Review recommendations above
2. Update parser.js to extract available fields
3. Re-run data import
4. Verify fields are populated
