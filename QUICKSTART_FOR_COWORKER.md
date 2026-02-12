# SmartCart - Quick Start Guide for New Developer

Welcome! This guide will help you get the SmartCart project running on your machine.

## 📦 What You Should Have Received

- `smartcart_backup.sql` or `smartcart_full_export.sql` - Complete database with data
- Project repository link or ZIP file
- This README

## 🛠️ Prerequisites

Install these first:
1. **Node.js 18+** - https://nodejs.org
2. **PostgreSQL 14+** - https://www.postgresql.org/download
3. **Git** (optional) - https://git-scm.com

## ⚡ Quick Setup (5 minutes)

### 1. Install Dependencies

```bash
# Clone or extract project
cd ProjGmar

# Install server dependencies
cd server
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Setup Database

**Create Database:**
```bash
# Using psql
createdb smartcart_db

# Or in PostgreSQL shell:
psql -U postgres
CREATE DATABASE smartcart_db;
\q
```

**Import Data:**
```bash
# Import the backup file you received
psql -U postgres -d smartcart_db -f smartcart_backup.sql

# Or if using Docker:
docker exec -i postgres-container psql -U postgres -d smartcart_db < smartcart_backup.sql
```

### 3. Configure Environment

```bash
cd server
cp .env.example .env
```

Edit `.env` with your settings:
```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/smartcart_db
JWT_SECRET=generate-random-secret-here
JWT_REFRESH_SECRET=generate-another-secret-here
NODE_ENV=development
```

**Generate Strong Secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 4. Start the Application

**Terminal 1 - Backend:**
```bash
cd server
npm run dev
```
Server runs on http://localhost:3000

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```
Frontend runs on http://localhost:5173

### 5. Test It

Open http://localhost:5173 in your browser:
- Register a new account
- Create a shopping list
- Browse the store
- Add items to your list

## 🎯 Key Features to Test

1. **User Authentication**
   - Register → Email verification → Login

2. **Shopping Lists**
   - Create lists
   - Add items via search
   - Real-time updates (open same list in 2 tabs)

3. **Price Comparison**
   - Add items to list
   - Click "השוואת מחירים" (Compare Prices)
   - See which supermarket chain is cheapest

4. **Family Features**
   - Go to Profile → Family Settings
   - Create child account
   - Login as child
   - Request items (parent must approve)

5. **Templates**
   - Save a list as template
   - Create new list from template

## 📁 Project Structure

```
ProjGmar/
├── server/                  # Backend (Express + Socket.io)
│   ├── server.js           # Main server file
│   ├── db/                 # Database utilities
│   │   ├── parser.js       # XML parser for supermarket data
│   │   └── export-database.js
│   └── .env                # Environment config
├── frontend/               # Frontend (React + Vite)
│   ├── src/
│   │   ├── pages/          # Page components
│   │   ├── components/     # Reusable components
│   │   ├── context/        # React context (auth)
│   │   └── App.css         # Design system
│   └── .env                # Frontend config
├── deploy.sql              # Fresh database schema
└── DEPLOYMENT.md           # Production deployment guide
```

## 🔧 Development Tips

**Hot Reload:**
- Backend: Uses `nodemon` - auto-restarts on file changes
- Frontend: Uses Vite HMR - instant updates

**Database Inspection:**
```bash
psql -U postgres -d smartcart_db

# View tables
\dt app.*
\dt app2.*

# Sample queries
SELECT COUNT(*) FROM app.items;
SELECT COUNT(*) FROM app.prices;
SELECT * FROM app2.users;
```

**Logs:**
- Backend: Check terminal running `npm run dev`
- Frontend: Browser DevTools Console
- Database: PostgreSQL logs

**Common Commands:**
```bash
# Backend
npm run dev      # Development with auto-restart
npm start        # Production

# Frontend
npm run dev      # Development server
npm run build    # Production build
npm run preview  # Preview production build

# Database
npm run db:reset # Reset database (if script exists)
```

## 🐛 Troubleshooting

**"Connection refused" to database:**
- Make sure PostgreSQL is running
- Check DATABASE_URL in .env
- Verify port (default 5432)

**Frontend can't reach backend:**
- Backend should be on http://localhost:3000
- Check CORS settings in server/server.js
- Check frontend is using correct API URL

**Socket.io not connecting:**
- Check browser console for errors
- Verify both frontend and backend are running
- Check CORS settings

**"Module not found" errors:**
- Run `npm install` in both server/ and frontend/
- Delete node_modules and package-lock.json, reinstall

**Data not showing in store:**
- Run parser to populate products: `cd server/db && node parser.js`
- This downloads Israeli supermarket data (may take 30+ minutes)

## 📚 API Endpoints

**Auth:**
- `POST /api/register` - Register user
- `POST /api/login` - Login
- `POST /api/refresh` - Refresh token
- `GET /api/me` - Get current user

**Lists:**
- `GET /api/lists` - Get user's lists
- `GET /api/lists/:id/items` - Get list items
- `POST /api/lists/:id/items` - Add item
- `GET /api/lists/:id/compare` - Price comparison

**Store:**
- `GET /api/store` - Browse products
- `GET /api/products/:id` - Get product details

**Family:**
- `POST /api/family/create-child` - Create child account
- `GET /api/family/children` - Get children
- `POST /api/kid-requests` - Child requests item
- `GET /api/kid-requests/pending` - Parent's pending requests

## 🚀 Next Steps

1. Read `DEPLOYMENT.md` for production deployment
2. Check `CODE_EXPLANATION.md` for architecture details
3. Review `server/server.js` for all API routes
4. Explore `frontend/src/pages/` for UI components

## 📞 Need Help?

- Check existing code comments
- Review the deployment guide
- Test the live features
- Ask the team!

Happy coding! 🎉
