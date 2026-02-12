# SmartCart Deployment Guide

Complete guide to deploy SmartCart to production.

## 📋 Prerequisites

- Node.js 18+ installed
- PostgreSQL 14+ database
- Domain name (optional but recommended)
- Email service (Gmail/SendGrid/etc.) for auth emails

---

## 🚀 Quick Deploy Options

### Option 1: Railway (Recommended - Easy)

**1. Install Railway CLI**
```bash
npm install -g @railway/cli
railway login
```

**2. Create New Project**
```bash
cd ProjGmar
railway init
```

**3. Add PostgreSQL**
```bash
railway add postgresql
```

**4. Set Environment Variables**
```bash
# Generate strong JWT secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Copy the output and use for JWT_SECRET and JWT_REFRESH_SECRET

railway variables set JWT_SECRET="paste-generated-secret-here"
railway variables set JWT_REFRESH_SECRET="paste-another-generated-secret-here"
railway variables set NODE_ENV=production
railway variables set FRONTEND_URL="https://your-frontend-domain.com"
railway variables set SMTP_HOST="smtp.gmail.com"
railway variables set SMTP_PORT=587
railway variables set SMTP_USER="your-email@gmail.com"
railway variables set SMTP_PASS="your-app-password"
```

**5. Deploy Database Schema**
```bash
# Get your database URL
railway variables get DATABASE_URL

# Deploy schema (Railway will show the DATABASE_URL)
psql $DATABASE_URL -f deploy.sql
```

**6. Deploy Backend**
```bash
cd server
railway up
```

**7. Deploy Frontend**
Create `frontend/.env.production`:
```env
VITE_API_URL=https://your-backend-domain.railway.app
VITE_WS_URL=wss://your-backend-domain.railway.app
```

```bash
cd ../frontend
npm run build
railway up
```

---

### Option 2: Heroku

**1. Install Heroku CLI**
```bash
npm install -g heroku
heroku login
```

**2. Create App & Database**
```bash
cd ProjGmar/server
heroku create smartcart-api
heroku addons:create heroku-postgresql:essential-0
```

**3. Set Environment Variables**
```bash
# Generate secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

heroku config:set JWT_SECRET="generated-secret"
heroku config:set JWT_REFRESH_SECRET="another-generated-secret"
heroku config:set NODE_ENV=production
heroku config:set FRONTEND_URL="https://smartcart-frontend.herokuapp.com"
heroku config:set SMTP_HOST="smtp.gmail.com"
heroku config:set SMTP_PORT=587
heroku config:set SMTP_USER="your-email@gmail.com"
heroku config:set SMTP_PASS="your-app-password"
```

**4. Deploy Database Schema**
```bash
heroku pg:psql -f ../../deploy.sql
```

**5. Create Procfile**
```bash
echo "web: node server.js" > Procfile
```

**6. Deploy**
```bash
git add .
git commit -m "Deploy to Heroku"
git push heroku master
```

---

### Option 3: VPS (DigitalOcean, AWS, etc.)

**1. SSH into Server**
```bash
ssh root@your-server-ip
```

**2. Install Dependencies**
```bash
# Update system
apt update && apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PostgreSQL
apt install -y postgresql postgresql-contrib

# Install PM2 for process management
npm install -g pm2
```

**3. Setup PostgreSQL**
```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE smartcart_db;
CREATE USER smartcart_user WITH PASSWORD 'secure-password-here';
GRANT ALL PRIVILEGES ON DATABASE smartcart_db TO smartcart_user;
\q
```

**4. Clone & Setup Project**
```bash
cd /var/www
git clone https://github.com/noammiz1236/ProjGmar smartcart
cd smartcart

# Deploy database schema
psql -U smartcart_user -d smartcart_db -f deploy.sql

# Install server dependencies
cd server
npm install --production
```

**5. Configure Environment**
```bash
nano .env
```
Paste:
```env
DATABASE_URL=postgresql://smartcart_user:secure-password-here@localhost:5432/smartcart_db
PORT=3000
JWT_SECRET=generated-secret-here
JWT_REFRESH_SECRET=another-generated-secret-here
NODE_ENV=production
FRONTEND_URL=https://your-domain.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

**6. Start with PM2**
```bash
pm2 start server.js --name smartcart-api
pm2 save
pm2 startup
```

**7. Setup Nginx Reverse Proxy**
```bash
apt install -y nginx

nano /etc/nginx/sites-available/smartcart
```
Paste:
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/smartcart /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

**8. SSL with Let's Encrypt**
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d api.yourdomain.com
```

**9. Build & Serve Frontend**
```bash
cd /var/www/smartcart/frontend
npm install
echo "VITE_API_URL=https://api.yourdomain.com" > .env.production
echo "VITE_WS_URL=wss://api.yourdomain.com" >> .env.production
npm run build

# Copy build to nginx
cp -r dist/* /var/www/html/
```

---

## 🔐 Security Checklist

- [ ] Changed default JWT secrets to strong random values
- [ ] Using HTTPS/SSL in production
- [ ] Database password is strong and unique
- [ ] SMTP credentials use app-specific passwords
- [ ] Environment variables never committed to git
- [ ] CORS configured to only allow your frontend domain
- [ ] PostgreSQL not exposed to public internet
- [ ] Regular backups configured
- [ ] Rate limiting enabled (consider adding express-rate-limit)
- [ ] Helmet.js added for security headers

---

## 📊 Database Backup

### Automated Daily Backups
```bash
# Add to crontab (crontab -e)
0 2 * * * pg_dump -U smartcart_user smartcart_db > /backups/smartcart_$(date +\%Y\%m\%d).sql
```

### Manual Backup
```bash
pg_dump -U username database_name > backup.sql
```

### Restore
```bash
psql -U username database_name < backup.sql
```

---

## 🏃 Running Parser for Product Data

After deployment, populate the database with Israeli supermarket data:

```bash
cd server/db
node parser.js
```

Or setup automated updates:
```bash
# Add to crontab for daily updates at 3 AM
0 3 * * * cd /var/www/smartcart/server/db && node parser.js
```

---

## 🔍 Monitoring & Logs

### View PM2 Logs
```bash
pm2 logs smartcart-api
pm2 monit
```

### Railway Logs
```bash
railway logs
```

### Heroku Logs
```bash
heroku logs --tail
```

---

## 🌍 Frontend Deployment (Vercel/Netlify)

### Vercel
```bash
cd frontend
npm install -g vercel
vercel
```

Add environment variables in Vercel dashboard:
- `VITE_API_URL`: Your backend URL
- `VITE_WS_URL`: Your WebSocket URL (wss://)

### Netlify
```bash
cd frontend
npm install -g netlify-cli
netlify deploy --prod
```

Add environment variables in Netlify dashboard.

---

## 📝 Post-Deployment

1. **Test authentication flow**
   - Register new user
   - Verify email works
   - Login/logout
   - Password reset

2. **Test core features**
   - Create shopping list
   - Add items from store
   - Price comparison
   - Real-time updates (Socket.io)
   - Child account creation
   - Kid requests

3. **Monitor performance**
   - Check API response times
   - Monitor database query performance
   - Watch for memory leaks

4. **Setup monitoring** (optional)
   - Sentry for error tracking
   - LogRocket for user sessions
   - UptimeRobot for uptime monitoring

---

## 🆘 Troubleshooting

### "Connection refused" errors
- Check DATABASE_URL is correct
- Verify PostgreSQL is running
- Check firewall rules

### Email not sending
- Verify SMTP credentials
- For Gmail: Enable "Less secure app access" or use App Password
- Check SMTP_PORT (587 for TLS, 465 for SSL)

### Socket.io connection fails
- Check CORS settings in server.js
- Verify WebSocket URL uses wss:// in production
- Check reverse proxy WebSocket configuration

### Frontend can't reach API
- Verify FRONTEND_URL in backend .env
- Check VITE_API_URL in frontend
- Inspect browser console for CORS errors

---

## 📞 Support

- GitHub Issues: https://github.com/noammiz1236/ProjGmar/issues
- Database Schema: See deploy.sql
- API Documentation: See server/server.js routes
