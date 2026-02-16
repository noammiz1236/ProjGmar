import sys
import io
import time
import psycopg2
from camoufox.sync_api import Camoufox

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Database connection
conn = psycopg2.connect(
    host='localhost',
    database='smartcart',
    user='smartcart',
    password='smartcart123',
    port=5432
)
cursor = conn.cursor()

def scrape_product_image(barcode):
    """Scrape product image from Rami Levy using Camoufox"""
    try:
        with Camoufox(
            headless=True,
            humanize=True,
            os='windows'
        ) as browser:
            page = browser.new_page()
            
            # Navigate to search page
            url = f'https://www.rami-levy.co.il/he/online/search?q={barcode}'
            page.goto(url, wait_until='networkidle')
            
            # Wait for content to load
            page.wait_for_timeout(2000)
            
            # Try to find product image
            image_url = None
            
            # Try different selectors
            selectors = [
                'img[class*="product"]',
                'img[alt*="מוצר"]',
                '.product-image img',
                'img[src*="product"]'
            ]
            
            for selector in selectors:
                try:
                    elem = page.query_selector(selector)
                    if elem:
                        src = elem.get_attribute('src')
                        if src and 'placeholder' not in src and 'logo' not in src:
                            # Make URL absolute if it's relative
                            if src.startswith('/'):
                                src = 'https://www.rami-levy.co.il' + src
                            # Extract actual image URL from CDN proxy if present
                            if '/_ipx/' in src and 'https://img.rami-levy.co.il' in src:
                                import re
                                match = re.search(r'https://img\.rami-levy\.co\.il[^)]+', src)
                                if match:
                                    src = match.group(0)
                            image_url = src
                            break
                except:
                    continue
            
            page.close()
            return image_url
            
    except Exception as e:
        print(f"Error scraping barcode {barcode}: {str(e)}")
        return None

def main():
    try:
        # Count basic consumer products
        cursor.execute("""
            SELECT COUNT(DISTINCT i.id) 
            FROM app.items i
            WHERE i.id IN (
                SELECT item_id 
                FROM app.prices 
                GROUP BY item_id 
                HAVING COUNT(*) >= 100
            )
            AND i.barcode IS NOT NULL 
            AND LENGTH(i.barcode) >= 8 
            AND (i.image_url IS NULL OR i.image_url = '')
            AND (
                i.name ILIKE '%%חלב%%' OR i.name ILIKE '%%לחם%%' OR i.name ILIKE '%%ביצ%%' 
                OR i.name ILIKE '%%קמח%%' OR i.name ILIKE '%%סוכר%%' OR i.name ILIKE '%%שמן%%' 
                OR i.name ILIKE '%%אורז%%' OR i.name ILIKE '%%פסטה%%' OR i.name ILIKE '%%מקרוני%%'
                OR i.name ILIKE '%%גבינ%%' OR i.name ILIKE '%%יוגורט%%' OR i.name ILIKE '%%חמאה%%' 
                OR i.name ILIKE '%%מלח%%' OR i.name ILIKE '%%קפה%%' OR i.name ILIKE '%%תה%%'
            )
        """)
        result = cursor.fetchone()
        if not result or result[0] is None:
            print("No products found")
            return
        total = result[0]
        print(f"Total basic products: {total}\n")
        
        processed = 0
        success_count = 0
        fail_count = 0
        batch_size = 20
        
        while processed < total:
            # Get next batch
            cursor.execute("""
                SELECT DISTINCT i.id, i.barcode, i.name 
                FROM app.items i
                WHERE i.id IN (
                    SELECT item_id 
                    FROM app.prices 
                    GROUP BY item_id 
                    HAVING COUNT(*) >= 100
                )
                AND i.barcode IS NOT NULL 
                AND LENGTH(i.barcode) >= 8 
                AND (i.image_url IS NULL OR i.image_url = '')
                AND (
                    i.name ILIKE '%%חלב%%' OR i.name ILIKE '%%לחם%%' OR i.name ILIKE '%%ביצ%%' 
                    OR i.name ILIKE '%%קמח%%' OR i.name ILIKE '%%סוכר%%' OR i.name ILIKE '%%שמן%%' 
                    OR i.name ILIKE '%%אורז%%' OR i.name ILIKE '%%פסטה%%' OR i.name ILIKE '%%מקרוני%%'
                    OR i.name ILIKE '%%גבינ%%' OR i.name ILIKE '%%יוגורט%%' OR i.name ILIKE '%%חמאה%%' 
                    OR i.name ILIKE '%%מלח%%' OR i.name ILIKE '%%קפה%%' OR i.name ILIKE '%%תה%%'
                )
                LIMIT %s
            """, (batch_size,))
            
            products = cursor.fetchall()
            if not products:
                break
            
            batch_num = (processed // batch_size) + 1
            print(f"\n=== Batch {batch_num} ({processed + 1}-{processed + len(products)} of {total}) ===\n")
            
            for product_id, barcode, name in products:
                processed += 1
                print(f"[{processed}/{total}] {name} ({barcode})")
                
                try:
                    image_url = scrape_product_image(barcode)
                    
                    if image_url:
                        cursor.execute(
                            "UPDATE app.items SET image_url = %s, updated_at = NOW() WHERE id = %s",
                            (image_url, product_id)
                        )
                        conn.commit()
                        print(f"[OK] {image_url}\n")
                        success_count += 1
                    else:
                        cursor.execute(
                            "UPDATE app.items SET image_url = '', updated_at = NOW() WHERE id = %s",
                            (product_id,)
                        )
                        conn.commit()
                        print("[FAIL] No image\n")
                        fail_count += 1
                    
                    # Very slow delay (10 seconds)
                    time.sleep(10)
                    
                except Exception as e:
                    print(f"[ERROR] {str(e)}\n")
                    fail_count += 1
                    continue
            
            print(f"\nProgress: {success_count} found, {fail_count} not found")
        
        print(f"\n=== Final Summary ===")
        print(f"Total processed: {processed}")
        print(f"Images found: {success_count}")
        print(f"Not found: {fail_count}")
        if processed > 0:
            print(f"Success rate: {((success_count / processed) * 100):.1f}%")
            
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    main()
