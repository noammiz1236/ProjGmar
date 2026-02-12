# הסבר קוד SmartCart - שורה אחר שורה

## תוכן עניינים
1. [מבנה הפרויקט](#מבנה-הפרויקט)
2. [App.css - מערכת עיצוב גלובלית](#appcss---מערכת-עיצוב-גלובלית)
3. [index.html - דף הבסיס](#indexhtml---דף-הבסיס)
4. [main.jsx - נקודת הכניסה](#mainjsx---נקודת-הכניסה)
5. [App.jsx - הניתוב הראשי](#appjsx---הניתוב-הראשי)
6. [api.js - חיבור לשרת](#apijs---חיבור-לשרת)
7. [socket.js - חיבור בזמן אמת](#socketjs---חיבור-בזמן-אמת)
8. [AuthContext.jsx - ניהול אימות](#authcontextjsx---ניהול-אימות)
9. [NavBar.jsx - תפריט ניווט](#navbarjsx---תפריט-ניווט)
10. [Home.jsx - דשבורד ראשי](#homejsx---דשבורד-ראשי)
11. [Login.jsx - דף התחברות](#loginjsx---דף-התחברות)
12. [Register.jsx - דף הרשמה](#registerjsx---דף-הרשמה)
13. [Store.jsx - דף חנות](#storejsx---דף-חנות)
14. [ProductPage.jsx - דף מוצר](#productpagejsx---דף-מוצר)
15. [MyLists.jsx - הרשימות שלי](#mylistsjsx---הרשימות-שלי)
16. [ListDetail.jsx - צפייה ברשימה](#listdetailjsx---צפייה-ברשימה)
17. [ListItemRow.jsx - שורת פריט ברשימה](#listitemrowjsx---שורת-פריט-ברשימה)
18. [Templates.jsx - ניהול תבניות](#templatesjsx---ניהול-תבניות)
19. [מודלים (Modals)](#מודלים-modals)
20. [קומפוננטות עזר](#קומפוננטות-עזר)
21. [Profile.jsx - הגדרות חשבון](#profilejsx---הגדרות-חשבון)
22. [מסד נתונים - init.sql](#מסד-נתונים---initsql)

---

## מבנה הפרויקט

```
frontend/
├── index.html              ← דף HTML הבסיסי שטוען את האפליקציה
├── src/
│   ├── main.jsx            ← נקודת הכניסה - מרנדר את App לתוך ה-DOM
│   ├── App.jsx             ← הגדרת כל הנתיבים (routes) של האפליקציה
│   ├── App.css             ← מערכת עיצוב גלובלית (CSS Variables, קלאסים משותפים)
│   ├── api.js              ← Axios instance עם interceptors לטוקנים
│   ├── socket.js           ← Socket.io client singleton
│   ├── context/
│   │   └── AuthContext.jsx ← Context לניהול מצב המשתמש המחובר
│   ├── pages/              ← דפים ראשיים
│   │   ├── Home.jsx        ← דשבורד (אורח: landing page, מחובר: פעולות מהירות + רשימות)
│   │   ├── Login.jsx       ← טופס התחברות
│   │   ├── Register.jsx    ← טופס הרשמה
│   │   ├── ForgotPassword.jsx ← איפוס סיסמה
│   │   ├── Store.jsx       ← חנות מוצרים עם infinite scroll
│   │   ├── ProductPage.jsx ← דף מוצר בודד
│   │   ├── MyLists.jsx     ← רשימת כל הרשימות של המשתמש
│   │   ├── ListDetail.jsx  ← צפייה/עריכה של רשימה בודדת
│   │   ├── Templates.jsx   ← ניהול תבניות שמורות
│   │   ├── JoinList.jsx    ← הצטרפות לרשימה דרך קישור
│   │   └── Profile.jsx     ← הגדרות חשבון ואבטחה
│   └── components/         ← קומפוננטות משותפות
│       ├── NavBar.jsx      ← תפריט ניווט עליון + סיידבר למובייל
│       ├── PrivateRoute.jsx ← מגן על נתיבים שדורשים התחברות
│       ├── ListItemRow.jsx ← שורת פריט ברשימה (checkbox, תשלום, הערות)
│       ├── ItemNoteEditor.jsx ← עורך הערה inline על פריט
│       ├── ItemComments.jsx   ← תגובות על פריט (real-time)
│       ├── CreateListModal.jsx ← מודל ליצירת רשימה חדשה
│       ├── InviteLinkModal.jsx ← מודל ליצירת קישור הזמנה
│       ├── SaveAsTemplateModal.jsx ← מודל לשמירה כתבנית
│       ├── ApplyTemplateModal.jsx ← מודל ליצירת רשימה מתבנית
│       ├── BarcodeScanner.jsx     ← סורק ברקוד עם מצלמה
│       ├── ProductSearchForList.jsx ← חיפוש מוצר להוספה לרשימה
│       └── ProductFilter.jsx       ← פילטרים לחנות
```

---

## App.css - מערכת עיצוב גלובלית

### CSS Variables (משתנים)
```css
:root {
  --sc-primary: #4f46e5;    /* צבע ראשי - אינדיגו */
  --sc-bg: #f0f2f5;         /* רקע כללי - אפור בהיר */
  --sc-surface: #ffffff;     /* רקע כרטיסים - לבן */
  --sc-text: #1e293b;       /* צבע טקסט ראשי */
  --sc-border: #e2e8f0;     /* צבע גבולות */
  --sc-radius: 12px;        /* עיגול פינות */
  --sc-shadow: ...;         /* צללים */
  --sc-gradient: ...;       /* גרדיאנט ראשי */
}
```

### קלאסים עיקריים
- **`sc-card`** - כרטיס בסיסי עם גבול, צל, ופינות מעוגלות
- **`sc-card-interactive`** - כרטיס שזז כלפי מעלה ב-hover (cursor: pointer)
- **`sc-glass`** - כרטיס עם אפקט blur (זכוכית חלבית)
- **`sc-btn-primary`** - כפתור ראשי עם גרדיאנט + צל
- **`sc-btn-ghost`** - כפתור שקוף עם גבול
- **`sc-input`** - שדה קלט עם גבול עגול ו-focus effect
- **`sc-badge-primary`** - תג קטן עם רקע שקוף בצבע ראשי
- **`sc-modal-overlay`** - שכבת רקע כהה עם blur למודלים
- **`sc-modal`** - חלון מודל עם אנימציית כניסה
- **`sc-item-row`** - שורת פריט ברשימה
- **`sc-item-paid`** - שורת פריט ששולם (ירוק)
- **`sc-product-card`** - כרטיס מוצר בחנות
- **`sc-hero`** - אזור hero עם גרדיאנט
- **`page-fade-in`** - אנימציית כניסה לכל דף

---

## index.html - דף הבסיס

```html
<html lang="he" dir="rtl">  <!-- שפה עברית, כיוון ימין-לשמאל -->
```
- **Bootstrap RTL** - ספריית CSS לעיצוב רספונסיבי בעברית
- **Bootstrap Icons** - אייקונים (bi-cart3, bi-search, bi-trash וכו')
- **Vite** - מרנדר את `src/main.jsx` כ-module

---

## main.jsx - נקודת הכניסה

```jsx
import "./App.css";          // טוען את מערכת העיצוב הגלובלית
import App from "./App.jsx";  // הקומפוננטה הראשית

createRoot(document.getElementById("root")).render(
  <StrictMode>               // מצב פיתוח - מזהיר על בעיות
    <App />                  // מרנדר את האפליקציה
  </StrictMode>
);
```

---

## App.jsx - הניתוב הראשי

```jsx
<AuthProvider>               // עוטף הכל - מספק context של המשתמש המחובר
  <BrowserRouter>            // מאפשר ניווט בין דפים ללא refresh
    <NavBar />               // תפריט ניווט - מוצג בכל דף
    <Routes>
      <Route path="/" element={<Home />} />              // דשבורד
      <Route path="/login" element={<Login />} />         // התחברות
      <Route path="/store" element={<Store />} />         // חנות
      <Route path="/list" element={                       // רשימות (מוגן)
        <PrivateRoute><MyLists /></PrivateRoute>
      } />
      <Route path="/list/:listId" element={               // רשימה בודדת
        <PrivateRoute><ListDetail /></PrivateRoute>
      } />
      // ...נתיבים נוספים
    </Routes>
  </BrowserRouter>
</AuthProvider>
```

**PrivateRoute** - בודק אם המשתמש מחובר. אם לא → מפנה ל-login.

---

## api.js - חיבור לשרת

```jsx
const api = axios.create({
  baseURL: "http://localhost:3000",  // כתובת השרת
  withCredentials: true,              // שולח cookies (refresh token) בכל בקשה
});

let accessToken = null;  // טוקן גישה נשמר בזיכרון (לא ב-localStorage - יותר מאובטח)

// Interceptor לבקשות - מוסיף את הטוקן ל-Header
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Interceptor לתגובות - אם קיבלנו 401 (לא מורשה), מנסים לחדש את הטוקן
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !originalRequest._retry) {
      // שולחים בקשת refresh עם ה-cookie
      const res = await axios.post("/api/refresh", {}, { withCredentials: true });
      accessToken = res.data.accessToken;
      // מנסים שוב את הבקשה המקורית עם הטוקן החדש
      return api(originalRequest);
    }
  }
);
```

---

## socket.js - חיבור בזמן אמת

```jsx
import { io } from "socket.io-client";
const socket = io("http://localhost:3000", { autoConnect: true });
export default socket;
```

**Socket.io** מאפשר תקשורת דו-כיוונית בזמן אמת. כשמשתמש אחד מוסיף פריט לרשימה, כל המשתמשים האחרים רואים את זה מיד.

---

## AuthContext.jsx - ניהול אימות

```jsx
const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);  // null = לא מחובר
  const [loading, setLoading] = useState(true);  // true = בודק אם יש session

  useEffect(() => {
    const initAuth = async () => {
      try {
        // מנסה לחדש טוקן בעזרת cookie קיים
        const res = await axios.post("/api/refresh", {}, { withCredentials: true });
        setAccessToken(res.data.accessToken);

        // מביא את פרטי המשתמש
        const userRes = await api.get("/api/me");
        setUser(userRes.data.user);
      } catch {
        setUser(null);  // אין session - משתמש אורח
      } finally {
        setLoading(false);  // סיימנו לבדוק
      }
    };
    initAuth();
  }, []);

  // מספק את user + setUser לכל האפליקציה
  return (
    <AuthContext.Provider value={{ user, setUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
```

---

## NavBar.jsx - תפריט ניווט

### מה הוא עושה:
1. **לוגו** - "SmartCart" עם אייקון עגלה
2. **לינקים** - הרשימות שלי / חנות / תבניות (מסומן active לפי הנתיב הנוכחי)
3. **חיפוש** - שדה חיפוש עם debounce (מחכה 500ms אחרי הקלדה)
4. **אזור משתמש** - אם מחובר: שם + הגדרות + התנתק, אם אורח: התחברות + הרשמה
5. **סיידבר מובייל** - במסכים קטנים: כפתור המבורגר פותח תפריט צד

### קוד חשוב:
```jsx
const isActive = (path) => location.pathname === path;
// בודק אם הנתיב הנוכחי תואם → מוסיף class "active"

useEffect(() => {
  const timer = setTimeout(async () => {
    if (searchQuery.trim().length < 2) return;
    const { data } = await api.get("/api/search", { params: { q: searchQuery } });
    setResults(data);
  }, 500);  // debounce - מחכה 500ms אחרי ההקלדה האחרונה
  return () => clearTimeout(timer);  // מבטל timeout קודם
}, [searchQuery]);
```

---

## Home.jsx - דשבורד ראשי

### למשתמש אורח (לא מחובר):
- **Hero section** - גרדיאנט עם כותרת, תיאור, וכפתורי הרשמה/התחברות
- **כרטיסי פיצ'רים** - 3 כרטיסים: רשימות משותפות, השוואת מחירים, סריקת ברקוד

### למשתמש מחובר:
- **ברכה** - "שלום, {שם}! מה נקנה היום?"
- **פעולות מהירות** - 4 כרטיסים: רשימות / חנות / תבניות / הגדרות
- **רשימות אחרונות** - מציג עד 6 רשימות עם שם, מספר פריטים, וחברים

```jsx
useEffect(() => {
  if (!user) return;  // אם לא מחובר - לא מביא רשימות
  api.get("/api/lists").then(({ data }) => setLists(data.lists || []));
}, [user]);
```

---

## Login.jsx - דף התחברות

1. **ולידציות** - בודק אורך סיסמה (8+) ותקינות אימייל
2. **שליחה לשרת** - `api.post("/api/login", { email, password })`
3. **שמירת טוקן** - `setAccessToken(res.data.accessToken)` → בזיכרון
4. **עדכון context** - `setUser(res.data.user)` → כל האפליקציה יודעת שהמשתמש מחובר
5. **ניווט** - `navigate("/")` → חוזר לדשבורד

```jsx
const [error, setError] = useState("");  // הודעת שגיאה מוצגת בדף (לא alert)
const [loading, setLoading] = useState(false);  // ספינר על הכפתור
```

---

## Register.jsx - דף הרשמה

דומה ל-Login עם שדות נוספים: שם פרטי, שם משפחה, אימות סיסמה.
ולידציות: סיסמאות תואמות, שם 2+ תווים, סיסמה 8+ תווים, אימייל תקין.

---

## Store.jsx - דף חנות

### Infinite Scroll:
```jsx
const offsetRef = useRef(0);  // עוקב אחרי ה-offset (מיקום ברשימה)

const fetchProducts = async (reset = false) => {
  const params = new URLSearchParams({ limit: 12, offset: currentOffset });
  // מוסיף פילטרים אם קיימים
  if (filters.category) params.append("category", filters.category);

  const response = await api.get(`/api/store?${params}`);

  if (reset) {
    setProducts(newProducts);         // החלפת רשימה (שינוי פילטר)
  } else {
    setProducts(prev => [...prev, ...newProducts]);  // הוספה לקיים (scroll)
  }
  setHasMore(response.data.hasMore);  // יש עוד? ממשיך לטעון
};
```

**InfiniteScroll** - קומפוננטה שמזהה כש-scroll מגיע לתחתית וקוראת ל-`fetchProducts`.

### כרטיסי מוצר:
כל מוצר מוצג עם: שם, רשת, מחיר, ותג "פרטים". לחיצה מנווטת לדף המוצר.

---

## ProductPage.jsx - דף מוצר

מקבל את המוצר דרך `location.state` (שנשלח מ-Store.jsx):
```jsx
const raw = location.state?.product;
const product = {
  name: raw?.item_name || "מוצר לא נמצא",
  price: raw?.price || "—",
};
```

מציג: תמונה (או placeholder), שם, מחיר, תיאור, בורר כמות, וכפתור הוסף לעגלה.

---

## MyLists.jsx - הרשימות שלי

```jsx
const fetchLists = async () => {
  const { data } = await api.get("/api/lists");  // מביא את כל הרשימות של המשתמש
  setLists(data.lists);
};
```

מציג:
- **כפתורים** - "רשימה חדשה" (פותח CreateListModal) + "מתבנית" (פותח ApplyTemplateModal)
- **כרטיסי רשימות** - שם, תפקיד (מנהל/חבר), מספר פריטים, מספר חברים
- **מצב ריק** - "אין רשימות עדיין" עם כפתור ליצירה

---

## ListDetail.jsx - צפייה ברשימה

### הדף המרכזי של האפליקציה! כולל:

1. **טעינת נתונים** מה-API:
```jsx
const { data } = await api.get(`/api/lists/${listId}/items`);
setList(data.list);       // שם הרשימה
setItems(data.items);     // כל הפריטים
setMembers(data.members); // חברי הרשימה
setUserRole(data.userRole); // admin/member
```

2. **הצטרפות לחדר Socket.io**:
```jsx
socket.emit("join_list", listId);  // מודיע לשרת שאנחנו בחדר הזה
```

3. **האזנה לאירועים בזמן אמת**:
```jsx
socket.on("receive_item", (newItem) => {
  setItems(prev => [newItem, ...prev]);  // פריט חדש → מוסיף לראש הרשימה
});
socket.on("item_deleted", ({ itemId }) => {
  setItems(prev => prev.filter(i => i.id !== itemId));  // מסיר מהרשימה
});
socket.on("item_paid", ({ itemId, paid_by_name }) => {
  // מעדכן את הפריט כ"שולם"
});
```

4. **הוספת פריט**:
```jsx
socket.emit("send_item", {
  listId, itemName, price, quantity, addby: user.id
});
```

5. **Progress bar** - מציג כמה אחוז מהפריטים הושלמו

6. **כפתורים**: סריקת ברקוד, חיפוש מוצר, הזמנת חברים, שמירה כתבנית

---

## ListItemRow.jsx - שורת פריט ברשימה

### מה כל פריט מציג:
- **Checkbox** - סימון V (toggle_item via socket)
- **שם** - עם קו חוצה אם סומן/שולם
- **כמות** - badge עם x2, x3 וכו'
- **מחיר** - badge סגול
- **מי הוסיף** - "הוסף ע"י נועם"
- **מי שילם** - "שולם ע"י ישראל" (בירוק)
- **הערה** - ItemNoteEditor (לחיצה פותחת עריכה)

### כפתורי פעולה:
```jsx
handleMarkPaid → socket.emit("mark_paid" / "unmark_paid")   // ₪ כפתור תשלום
setShowComments → פותח/סוגר תגובות                           // 💬 כפתור הערות
handleDelete → socket.emit("delete_item")                     // 🗑 כפתור מחיקה
```

### עיצוב:
- פריט ששולם: רקע ירוק בהיר + גבול ירוק
- פריט שסומן: שקיפות 60%

---

## Templates.jsx - ניהול תבניות

- **הצגת תבניות** - כרטיסים עם שם ומספר פריטים
- **יצירה מתבנית** - `api.post("/api/templates/:id/apply")` → יוצר רשימה חדשה
- **מחיקת תבנית** - `api.delete("/api/templates/:id")`

---

## מודלים (Modals)

### CreateListModal
- שדה שם רשימה
- `socket.emit("create_list", { list_name, userId })`
- callback מהשרת → navigate לרשימה החדשה

### InviteLinkModal
- `api.post("/api/lists/:id/invite")` → מחזיר invite link
- כפתור "העתק" → `navigator.clipboard.writeText(link)`

### SaveAsTemplateModal
- שדה שם תבנית
- `api.post("/api/templates", { listId, templateName })`
- אנימציית הצלחה (check icon ירוק)

### ApplyTemplateModal
- מציג רשימת תבניות קיימות
- לחיצה → `api.post("/api/templates/:id/apply")` → navigate לרשימה חדשה

### BarcodeScanner
- משתמש ב-`Html5QrcodeScanner` לסריקת ברקוד עם המצלמה
- `api.get("/api/items/barcode/:code")` → מחזיר מוצר
- ממלא אוטומטית את שם המוצר והמחיר בטופס ההוספה

---

## קומפוננטות עזר

### ItemNoteEditor
- לחיצה → פותח שדה עריכה
- blur/Enter → `socket.emit("update_note", { itemId, listId, note })`
- מציג: הערה בטקסט נטוי, או "לחץ להוספת הערה..."

### ItemComments
- טוען הערות: `api.get("/api/lists/:listId/items/:itemId/comments")`
- שולח הערה: `socket.emit("add_comment", { itemId, userId, comment })`
- מאזין: `socket.on("receive_comment", ...)` → מוסיף בזמן אמת
- מציג: שם משתמש + טקסט הערה

### ProductSearchForList
- Debounce של 400ms
- `api.get("/api/search", { params: { q: query } })`
- רשימה נפתחת → לחיצה → `onSelect(item)` → ממלא את שם המוצר

### ProductFilter
- טוען קטגוריות ורשתות מה-API
- פילטרים: קטגוריה, מחיר מינימום/מקסימום, מיון
- כל שינוי → `onFilterChange({ category, minPrice, maxPrice, sort })`

---

## Profile.jsx - הגדרות חשבון

### שני חלקים:
1. **פרטים אישיים** - שם פרטי, שם משפחה, אימייל → `api.put("/api/user/password")`
2. **אבטחה** - שינוי סיסמה עם ולידציות:
   - סיסמאות תואמות
   - 8 תווים מינימום
   - סיסמה חדשה ≠ נוכחית
   - אחרי שינוי → `api.post("/api/logout-all")` → מנתק מכל המכשירים

### ניהול הפעלה:
- "התנתק" → `api.post("/api/logout")`
- "התנתק מכל המכשירים" → `api.post("/api/logout-all")`

---

## מסד נתונים - init.sql

### סכמה `app` (parser + רשימות):

| טבלה | תפקיד |
|------|--------|
| `app.chains` | רשתות שיווק (שופרסל, רמי לוי...) |
| `app.sub_chains` | תת-רשתות |
| `app.branches` | סניפים (כתובת, עיר, קואורדינטות) |
| `app.items` | מוצרים (ברקוד, יצרן, קטגוריה) |
| `app.prices` | מחירים לפי סניף |
| `app.list` | רשימות קניות |
| `app.list_members` | חברי רשימה (admin/member) |
| `app.list_items` | פריטים ברשימה (שם, מחיר, כמות, is_checked, paid_by, note) |
| `app.list_item_comments` | הערות על פריטים |
| `app.list_invites` | קישורי הזמנה (invite_code, expires_at, max_uses) |
| `app.list_templates` | תבניות שמורות |
| `app.template_items` | פריטים בתבנית |

### סכמה `app2` (אימות + חנות API):

| טבלה | תפקיד |
|------|--------|
| `app2.users` | משתמשים (שם, אימייל, סיסמה מוצפנת) |
| `app2.tokens` | טוקנים (refresh, verify email, reset password) |
| `app2.chains` | רשתות (לחנות) |
| `app2.branches` | סניפים (לחנות) |
| `app2.items` | מוצרים (לחנות) |
| `app2.prices` | מחירים (לחנות) |

### עמודות חשובות ב-list_items:
```sql
paid_by INT          -- מזהה המשתמש ששילם
paid_at TIMESTAMP    -- מתי שולם
note TEXT            -- הערה על הפריט
addby INT            -- מי הוסיף את הפריט
is_checked BOOLEAN   -- האם סומן V
```

---

## טכנולוגיות עיקריות

| טכנולוגיה | שימוש |
|-----------|--------|
| **React 19** | ספריית UI |
| **Vite** | build tool (מהיר מ-webpack) |
| **React Router v7** | ניווט בין דפים |
| **Axios** | בקשות HTTP לשרת |
| **Socket.io** | תקשורת בזמן אמת (WebSocket) |
| **Bootstrap 5 RTL** | עיצוב רספונסיבי בעברית |
| **Bootstrap Icons** | אייקונים |
| **html5-qrcode** | סריקת ברקוד עם מצלמה |
| **Express 5** | שרת (backend) |
| **PostgreSQL** | מסד נתונים |
| **JWT** | אימות (access + refresh tokens) |
| **bcrypt** | הצפנת סיסמאות |
