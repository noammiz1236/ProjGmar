FROM node:18-alpine

WORKDIR /app

# העתקת קבצי הגדרות
COPY package*.json ./

# התקנת התלויות (כולל nodemon אם הוא ב-devDependencies)
RUN npm install

# העתקת שאר הקוד
COPY . .

# יצירת התיקייה עבור המחירים
RUN mkdir -p /app/my_prices

EXPOSE 5000

# שינוי כאן: שימוש ב-npx nodemon כדי שיזהה שינויים בקבצים
CMD ["npx", "nodemon", "server.js"]