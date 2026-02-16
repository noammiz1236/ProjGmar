# SmartCart Refactoring Guide

## מה השתנה?

הקוד פוצל מקובץ `server.js` ענק (3,131 שורות) למבנה מסודר עם routes ו-middleware נפרדים.

## מבנה חדש

```
server/
├── middleware/
│   └── auth.js              # JWT authentication middleware
├── routes/
│   ├── auth.js              # Authentication & user management (register, login, password)
│   ├── lists.js             # Shopping lists (CRUD, items, price comparison)
│   ├── family.js            # Family accounts (children, kid requests)
│   └── products.js          # Product search, barcode lookup, suggestions
├── server.js.backup         # Original server.js (גיבוי)
├── server_new.js            # New refactored server (clean & organized)
└── server.js                # הקובץ המקורי (עדיין פועל)
```

## איך לעבור לגרסה החדשה?

### אופציה 1: בדיקה בצד (מומלץ)
1. הרץ את הגרסה החדשה על פורט שונה:
```bash
PORT=3001 node server/server_new.js
```

2. בדוק שהכל עובד (התחבר ל-http://localhost:3001)

3. אם הכל תקין, החלף את הקבצים:
```bash
mv server/server.js server/server_old.js
mv server/server_new.js server/server.js
```

### אופציה 2: החלפה ישירה
```bash
cd C:\Users\rdiol\.openclaw\workspace\ProjGmar\server
mv server.js server_old.js
mv server_new.js server.js
npm start
```

## מה כלול בגרסה החדשה?

### ✅ נשמר
- כל הפונקציונליות של הקוד המקורי
- Socket.io events
- Cron jobs (recurring lists)
- Gamification system
- Push notifications
- Activity logging

### ✨ שופר
- **קריאות:** קוד מאורגן בקבצים לוגיים
- **תחזוקה:** קל יותר למצוא ולתקן באגים
- **הרחבה:** קל להוסיף features חדשים
- **Error handling:** טיפול משופר בשגיאות
- **Comments:** הערות מפורטות בכל route

### 🔧 Structure
```javascript
// Old (server.js)
3,131 lines of mixed code

// New (organized)
middleware/auth.js      →  30 lines
routes/auth.js          → 550 lines
routes/lists.js         → 520 lines
routes/family.js        → 350 lines
routes/products.js      → 230 lines
server_new.js           → 600 lines
────────────────────────────
Total:                  ~2,280 lines (cleaner, documented)
```

## API Endpoints (ללא שינוי)

כל ה-endpoints נשארו זהים:

### Authentication
- `POST /api/register`
- `GET /api/verify-email`
- `POST /api/login`
- `POST /api/refresh`
- `GET /api/me`
- `POST /api/logout`
- `POST /api/logout-all`
- `PUT /api/user/password`
- `POST /api/forgot-password`
- `POST /api/reset-password`

### Lists
- `GET /api/lists`
- `GET /api/lists/:id/items`
- `POST /api/lists/:id/items`
- `DELETE /api/lists/:id`
- `POST /api/lists/:id/leave`
- `GET /api/lists/:id/compare`
- `POST /api/lists/:id/invite`
- `GET /api/lists/:id/chat`
- `GET /api/lists/:id/activity`
- `PUT /api/lists/:id/reorder`
- `GET /api/lists/:listId/items/:itemId/comments`

### Family
- `POST /api/family/create-child`
- `GET /api/family/children`
- `DELETE /api/family/delete-child/:childId`
- `GET /api/family/lists/:id/children`
- `POST /api/family/lists/:id/children/:childId`
- `DELETE /api/family/lists/:id/children/:childId`
- `GET /api/family/kid-requests/pending`
- `GET /api/family/kid-requests/my`
- `POST /api/family/kid-requests`
- `POST /api/family/kid-requests/:id/resolve`

### Products
- `GET /api/search?q=...`
- `GET /api/items/barcode/:barcode`
- `GET /api/suggestions`
- `GET /api/products/:id/price-history`
- `GET /api/predict-quantity/:itemName`
- `POST /api/receipt/scan`
- `GET /api/delivery/providers`

## Socket.io Events (ללא שינוי)

- `register_user`
- `join_list`
- `send_item`
- `toggle_item`
- `delete_item`
- `mark_paid`
- `unmark_paid`
- `update_quantity`
- `update_note`
- `create_list`
- `add_comment`
- `send_chat_message`
- `assign_item`
- `reorder_items`

## בעיות אפשריות

1. **Import paths:** וודא ש-`import` statements תקינים
2. **Environment variables:** בדוק ש-.env מוגדר נכון
3. **Database:** וודא ש-PostgreSQL רץ ומחובר

## הצעדים הבאים

לאחר המעבר לגרסה החדשה, מומלץ:

1. ✅ **Tests:** כתוב integration tests
2. ✅ **Documentation:** עדכן README.md עם API docs
3. ✅ **Simplify:** שקול להסיר features שלא בשימוש (recipes, pantry)
4. ✅ **Error handling:** הוסף centralized error handler
5. ✅ **Logging:** הוסף structured logging (Winston/Pino)
6. ✅ **Validation:** הוסף input validation (Joi/Yup)
7. ✅ **Rate limiting:** הוסף rate limiting (express-rate-limit)

## תמיכה

אם משהו לא עובד, תמיד אפשר לחזור לגרסה הישנה:
```bash
mv server/server.js server/server_new_backup.js
mv server/server_old.js server/server.js
npm start
```

---

**עדכון אחרון:** 2026-02-15  
**גרסה:** 2.0.0 (Refactored)
