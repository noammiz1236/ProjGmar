const axios = require('axios');
const cheerio = require('cheerio');
const { Pool } = require('pg');

const pool = new Pool({
  user: 'smartcart',
  host: 'localhost',
  database: 'smartcart',
  password: 'smartcart123',
  port: 5432,
});

async function getProductImage(barcode) {
  try {
    // Try Rami Levy search
    const response = await axios.get(
      `https://www.rami-levy.co.il/he/online/search?q=${barcode}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      }
    );
    
    const $ = cheerio.load(response.data);
    
    // Debug: Save HTML to file to inspect
    const fs = require('fs');
    fs.writeFileSync('rami-levy-page.html', response.data);
    console.log('Saved HTML to rami-levy-page.html');
    
    // Count all images
    const allImages = $('img');
    console.log(`Found ${allImages.length} total images on page`);
    
    // Try to find product image
    let imageUrl = null;
    
    // Try different selectors
    const selectors = [
      'img.product-image',
      'img[class*="product"]',
      '.item-image img',
      'img[alt*="מוצר"]',
      'img[src*="product"]',
      'img'  // Try any image
    ];
    
    for (const selector of selectors) {
      const imgs = $(selector);
      console.log(`Selector "${selector}" found ${imgs.length} images`);
      
      imgs.each((i, elem) => {
        const src = $(elem).attr('src');
        const alt = $(elem).attr('alt');
        console.log(`  - src: ${src}, alt: ${alt}`);
      });
      
      const img = imgs.first();
      if (img.length && img.attr('src')) {
        imageUrl = img.attr('src');
        if (!imageUrl.startsWith('http')) {
          imageUrl = 'https://www.rami-levy.co.il' + imageUrl;
        }
        if (!imageUrl.includes('placeholder') && !imageUrl.includes('logo')) {
          break;
        }
      }
    }
    
    return imageUrl;
    
  } catch (error) {
    console.error(`Error fetching barcode ${barcode}:`, error.message);
    return null;
  }
}

async function testScrape() {
  try {
    // Get one product to test
    const result = await pool.query(
      `SELECT id, barcode, name FROM app.items 
       WHERE barcode = '7290000136431' 
       LIMIT 1`
    );
    
    if (result.rows.length === 0) {
      console.log('Product not found in database');
      return;
    }
    
    const product = result.rows[0];
    console.log(`Testing with: ${product.name} (${product.barcode})\n`);
    
    const imageUrl = await getProductImage(product.barcode);
    
    if (imageUrl) {
      console.log(`✓ Found image: ${imageUrl}`);
      
      // Update database
      await pool.query(
        'UPDATE app.items SET image_url = $1, updated_at = NOW() WHERE id = $2',
        [imageUrl, product.id]
      );
      console.log('✓ Updated in database');
    } else {
      console.log('✗ No image found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

testScrape();
