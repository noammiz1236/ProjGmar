const axios = require('axios');
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  user: 'smartcart',
  host: 'localhost',
  database: 'smartcart',
  password: 'smartcart123',
  port: 5432,
});

// Log files
const failedProductsFile = 'failed-products.txt';
const successProductsFile = 'success-products.txt';

// Clear log files at start
fs.writeFileSync(failedProductsFile, '=== Products without images ===\n\n');
fs.writeFileSync(successProductsFile, '=== Products with images found ===\n\n');

async function fetchImageFromOpenFoodFacts(barcode) {
  try {
    const response = await axios.get(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`, {
      timeout: 5000
    });
    
    if (response.data.status === 1 && response.data.product) {
      const imageUrl = response.data.product.image_url || response.data.product.image_front_url;
      return imageUrl;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching barcode ${barcode}:`, error.message);
    return null;
  }
}

async function importImages() {
  try {
    // Count total products
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM app.items WHERE barcode IS NOT NULL AND LENGTH(barcode) >= 8 AND (image_url IS NULL OR image_url = \'\')'
    );
    const totalProducts = parseInt(countResult.rows[0].count);
    console.log(`Total products without images: ${totalProducts}\n`);
    
    const BATCH_SIZE = 100;
    let processed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    
    while (processed < totalProducts) {
      // Get next batch
      const result = await pool.query(
        'SELECT id, barcode, name FROM app.items WHERE barcode IS NOT NULL AND LENGTH(barcode) >= 8 AND (image_url IS NULL OR image_url = \'\') LIMIT $1',
        [BATCH_SIZE]
      );
      
      if (result.rows.length === 0) break;
      
      console.log(`\n=== Batch ${Math.floor(processed / BATCH_SIZE) + 1} (${processed + 1}-${processed + result.rows.length} of ${totalProducts}) ===\n`);
      
      for (const row of result.rows) {
        processed++;
        console.log(`[${processed}/${totalProducts}] ${row.name} (${row.barcode})`);
        
        const imageUrl = await fetchImageFromOpenFoodFacts(row.barcode);
        
        if (imageUrl) {
          await pool.query(
            'UPDATE app.items SET image_url = $1, updated_at = NOW() WHERE id = $2',
            [imageUrl, row.id]
          );
          console.log(`✓ Image saved\n`);
          fs.appendFileSync(successProductsFile, `${row.barcode} | ${row.name} | ${imageUrl}\n`);
          totalSuccess++;
        } else {
          // Mark as tried (empty string means we tried but found nothing)
          await pool.query(
            'UPDATE app.items SET image_url = \'\', updated_at = NOW() WHERE id = $1',
            [row.id]
          );
          console.log(`✗ Not found\n`);
          fs.appendFileSync(failedProductsFile, `${row.barcode} | ${row.name}\n`);
          totalFailed++;
        }
        
        // Be nice to the API
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      console.log(`\nProgress: ${totalSuccess} found, ${totalFailed} not found`);
    }
    
    console.log(`\n=== Final Summary ===`);
    console.log(`Total processed: ${processed}`);
    console.log(`Images found: ${totalSuccess}`);
    console.log(`Not found: ${totalFailed}`);
    console.log(`Success rate: ${((totalSuccess / processed) * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

importImages();
