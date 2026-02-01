# AmzSellMetrics Backend API

Backend API for AmzSellMetrics application - Amazon transaction analytics and profitability analysis.

## 🏗️ Architecture

- **Framework:** Express.js + TypeScript
- **Database:** PostgreSQL (pricelab_db)
- **Authentication:** SSO via apps.iwa.web.tr
- **Process Manager:** PM2
- **Port:** 3001

## 📁 Structure

```
src/
├── routes/           # API endpoints
│   ├── amazonAnalyzer.ts    # Transaction analytics
│   ├── auth.ts              # Authentication
│   ├── costing.ts           # Cost calculations
│   ├── products.ts          # Product management
│   ├── settings.ts          # Application settings
│   └── ...
├── services/         # Business logic
├── middleware/       # Express middleware (SSO, auth)
├── db.ts            # Database connection
└── index.ts         # Main entry point
```

## 🚀 Deployment

### Local Development
```bash
npm install
npm run dev
```

### Production Deployment
```bash
# 1. Local: Make changes and commit
git add .
git commit -m "Description"
git push origin main

# 2. Server: Pull and rebuild
ssh -p 2222 root@78.47.117.36
cd /var/www/amzsellmetrics-backend
git pull
npm install
npm run build
pm2 restart amzsellmetrics-backend
```

## 🔧 Key Features

### Transaction Upload (Bulk)
- **Endpoint:** `POST /api/amazon-analyzer/transactions/bulk`
- **Max:** 10,000 transactions per request
- **Timezone Fix:** Calculates `date_only` based on marketplace timezone (not UTC)

### Marketplace Timezones
```typescript
US: -5    // Eastern Time
UK: 0     // UTC
DE: 1     // CET
AU: 10    // AEST
TR: 3     // TRT
// ... see src/routes/amazonAnalyzer.ts
```

## 🗄️ Database

- **Database:** pricelab_db
- **Main Table:** amz_transactions
- **Shared With:** PriceLab
- **Critical:** Test both apps after schema changes!

## 🐛 Recent Fixes (2026-02-01)

### Marketplace Timezone Fix
- **Issue:** Transactions stored with wrong date_only (UTC instead of marketplace timezone)
- **Impact:** 19 US transactions on Jan 31 appeared as Feb 1 ($2k revenue mismatch)
- **Fix:** Added `getDateOnlyInMarketplaceTimezone()` function
- **Status:** ✅ Deployed

## 📚 Documentation

See [memory-bank/amzsellmetrics-workflow.md](../memory-bank/amzsellmetrics-workflow.md) for full workflow.

## ⚠️ Important

- **NEVER** edit production files directly - always use Git workflow
- **ALWAYS** restart PM2 after deployment: `pm2 restart amzsellmetrics-backend`
- **TEST** both AmzSellMetrics and PriceLab after database changes

---

**Repository:** https://github.com/ahmtersoy23-ui/amzsellmetrics-backend
**Production:** https://amzsellmetrics.iwa.web.tr
