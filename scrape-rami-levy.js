const puppeteer = require('puppeteer');
const { Pool } = require('pg');

const pool = new Pool({
  user: 'smartcart',
  host: 'localhost',
  database: 'smartcart',
  password: 'smartcart123',
  port: 5432,
});

async function searchProductOnRamiLevy(barcode, browser) {
  const page = await browser.newPage();
  
  try {
    // Set timeout
    page.setDefaultTimeout(10000);
    
    // Navigate to search page
    await page.goto(`https://www.rami-levy.co.il/he/online/search?q=${barcode}`, {
      waitUntil: 'networkidle2'
    });
    
    // Wait for product image to load
    await page.waitForSelector('.product-image img, .product-item img, img[class*="product"]', {
      timeout: 5000
    }).catch(() => null);
    
    // Try to extract image URL
    const imageUrl = await page.evaluate(() => {
      // Try different selectors for product images
      const selectors = [
        '.product-image img',
        '.product-item img',
        'img[class*="product"]',
        '.item-image img',
        'img[alt*="product"]'
      ];
      
      for (const selector of selectors) {
        const img = document.querySelector(selector);
        if (img && img.src && !img.src.includes('placeholder')) {
          return img.src;
        }
      }
      return null;
    });
    
    await page.close();
    return imageUrl;
    
  } catch (error) {
    console.error(`Error searching barcode ${barcode}:`, error.message);
    await page.close();
    return null;
  }
}

async function scrapeImages() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    // Get sample products to test
    const result = await pool.query(
      'SELECT id, barcode, name FROM app.items WHERE barcode IS NOT NULL AND LENGTH(barcode) >= 8 AND (image_url IS NULL OR image_url = \'\') LIMIT 5'
    );
    
    console.log(`Testing with ${result.rows.length} products\n`);
    
    for (const row of result.rows) {
      console.log(`Searching: ${row.name} (${row.barcode})`);
      
      const imageUrl = await searchProductOnRamiLevy(row.barcode, browser);
      
      if (imageUrl) {
        console.log(`✓ Found: ${imageUrl}\n`);
        
        await pool.query(
          'UPDATE app.items SET image_url = $1, updated_at = NOW() WHERE id = $2',
          [imageUrl, row.id]
        );
      } else {
        console.log(`✗ Not found\n`);
      }
      
      // Delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
    await pool.end();
  }
}

scrapeImages();
