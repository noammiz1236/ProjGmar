# SmartCart Cleanup Plan

## מטרה: פישוט הקוד והסרת Feature Creep

### ❌ להסיר (לא קריטי לפונקציונליות המרכזית):

#### 1. Gamification System
**קבצים להסרה:**
- `app.user_points` table
- `app.user_badges` table
- `/api/gamification/stats` endpoint
- `awardPoints()` function
- Badge logic (first_item, shopper_10, streak_7)

**סיבה:** מסבך את הקוד, לא ברור שמישהו משתמש בזה, מוסיף complexity מיותר

#### 2. Recipes & Meal Plans
**קבצים להסרה:**
- `app.recipes` table
- `app.meal_plans` table
- `/api/recipes` endpoints (POST, GET, DELETE)
- `/api/meal-plans` endpoints (POST, GET, generate-list)

**סיבה:** זה לא אפליקציית בישול, זה השוואת מחירים. Feature creep ברור.

#### 3. Pantry / Expiration Tracker
**קבצים להסרה:**
- `app.pantry_items` table
- `/api/pantry` endpoints (POST, GET, DELETE)

**סיבה:** לא קשור למוצר המרכזי (השוואת מחירים ורשימות קניות)

#### 4. Receipt OCR Scanner
**קבצים להסרה/שיקול:**
- `/api/receipt/scan` endpoint
- Tesseract.js dependency
- `parseReceiptText()` function

**סיבה:** OCR זה טעון שגיאות, לא אמין, והרבה complexity. אפשר פשוט להוסיף פריטים ידנית או מחיפוש.

### ✅ לשמור (core functionality):

1. **Authentication** - הרשמה, כניסה, JWT
2. **Lists** - רשימות קניות משותפות
3. **Family accounts** - הורה + ילדים + אישורים
4. **Price comparison** - חיפוש מוצרים והשוואת מחירים בין רשתות
5. **Barcode lookup** - סריקת ברקוד
6. **Templates** - תבניות רשימות חוזרות
7. **Price alerts** - התראות כשמחיר יורד
8. **Product images** - תמונות מוצרים
9. **Suggestions** - הצעות מוצרים לפי היסטוריה

### 📋 סדר ביצוע:

#### Phase 1: Database Cleanup
1. גיבוי DB
2. מחיקת טבלאות מיותרות:
   - `app.user_points`
   - `app.user_badges`
   - `app.recipes`
   - `app.meal_plans`
   - `app.pantry_items`

#### Phase 2: Backend Cleanup
1. הסרת endpoints מיותרים מ-`server_new.js`
2. הסרת helper functions (awardPoints, etc.)
3. הסרת Tesseract dependency מ-package.json
4. ניקוי imports מיותרים

#### Phase 3: Frontend Cleanup (אם יש)
1. הסרת דפים/קומפוננטות מיותרים:
   - Recipes page
   - Meal plans page
   - Pantry page
   - Gamification UI
2. הסרת navigation items

#### Phase 4: Documentation
1. עדכון README.md
2. עדכון API documentation
3. רשימת features שהוסרו

### 💾 Backup Strategy
לפני כל שלב:
```bash
# Backup database
docker exec smartcart-db pg_dump -U smartcart smartcart > backup_pre_cleanup.sql

# Backup code
git commit -am "Pre-cleanup backup"
git tag cleanup-backup-$(date +%Y%m%d)
```

### 🎯 תוצאה צפויה:
- **-500 שורות קוד** (~15% reduction)
- **-5 טבלאות** במסד נתונים
- **-15 endpoints** ב-API
- **פרויקט פשוט יותר** וקל יותר לתחזוקה
- **מיקוד ברור** במה שבאמת חשוב

---

**הערה:** אם בעתיד נרצה את הפיצ'רים האלה, תמיד אפשר לשחזר מה-git history.
