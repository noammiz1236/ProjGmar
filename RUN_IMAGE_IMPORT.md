# Image Import Guide

## מצב נוכחי
- **285,828** מוצרים עם barcode
- **1,086** עם תמונות (0.38%)
- **284,742** בלי תמונות

## פתרון חכם

הסקריפט `import-images-smart.py` מייבא תמונות בצורה חכמה:

### אסטרטגיה
1. **סדר עדיפות:** מוצרים פופולריים קודם (לפי מספר מחירים)
2. **מקור ראשי:** Rami Levy direct URL (58% success rate)
3. **גיבוי:** Open Food Facts API (למוצרים זרים)
4. **מהירות:** ~50 מוצרים/שנייה

### איך להריץ

```bash
cd C:\Users\rdiol\.openclaw\workspace\ProjGmar
python import-images-smart.py
```

### אופציות

התסכריט ישאל כמה מוצרים לעבד:

1. **1,000** - בדיקה מהירה (2 דקות)
2. **10,000** - מוצרים פופולריים (3.5 שעות)
3. **50,000** - כיסוי מקיף (18 שעות)
4. **All** - כל המוצרים (~100 שעות)

### המלצה
התחל עם **10,000** מוצרים - זה יכסה את המוצרים הכי פופולריים שהמשתמשים מחפשים.

## ציפיות

בהתבסס על נתונים קודמים:
- **Rami Levy:** ~58% success rate
- **Open Food Facts:** ~7% success rate
- **סה"כ:** ~65% coverage צפוי

לדוגמה, 10,000 מוצרים:
- ~6,500 תמונות ימצאו
- ~3,500 לא ימצאו
- זמן: ~3.5 שעות

## תצוגה בפרונטנד

התמונות כבר מוטמעות בקוד:
- `ListItemRow` component
- `ProductPage` component  
- `ProductSearchForList` component

הן יוצגו אוטומטית ברגע שהן יהיו במסד הנתונים.

## ניטור

הסקריפט מדפיס:
- Progress bar בזמן אמת
- Success rate
- ETA (estimated time to completion)
- Summary בסוף

## כלים נוספים

### בדיקת סטטוס
```bash
docker exec smartcart-db psql -U smartcart -d smartcart -c "
SELECT 
  COUNT(*) FILTER (WHERE image_url IS NOT NULL AND image_url != '') as with_images,
  COUNT(*) FILTER (WHERE image_url IS NULL OR image_url = '') as without_images,
  ROUND(COUNT(*) FILTER (WHERE image_url IS NOT NULL AND image_url != '') * 100.0 / COUNT(*), 1) as coverage_pct
FROM app.items
WHERE barcode IS NOT NULL;
"
```

### ביטול אם נתקע
Press `Ctrl+C` - הסקריפט ישמור את ההתקדמות ויעצור בצורה מסודרת.

## טיפים

1. **התחל קטן:** רוץ 1,000 מוצרים כבדיקה
2. **רוץ בלילה:** 10,000+ מוצרים לוקח זמן
3. **אל תפריע:** הסקריפט שומר התקדמות, אבל עדיף לא להפסיק באמצע

---

**עדכון אחרון:** 2026-02-15
