import sys
import io
import re
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

# Reuse a single browser instance across all products
browser = None
page = None

def get_browser():
    """Get or create a shared Camoufox browser instance."""
    global browser, page
    if browser is None:
        browser = Camoufox(
            headless=True,
            humanize=True,
            os='windows'
        ).__enter__()
        page = browser.new_page()
    return page

def close_browser():
    """Close the shared browser instance."""
    global browser, page
    if page:
        try:
            page.close()
        except Exception:
            pass
        page = None
    if browser:
        try:
            browser.__exit__(None, None, None)
        except Exception:
            pass
        browser = None

def scrape_product_image(barcode):
    """Scrape product image from Rami Levy using Camoufox"""
    try:
        p = get_browser()

        # Navigate to search page
        url = f'https://www.rami-levy.co.il/he/online/search?q={barcode}'
        p.goto(url, wait_until='domcontentloaded', timeout=30000)

        # Wait for content to load
        p.wait_for_timeout(3000)

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
                elem = p.query_selector(selector)
                if elem:
                    src = elem.get_attribute('src')
                    if src and 'placeholder' not in src and 'logo' not in src:
                        # Make URL absolute if it's relative
                        if src.startswith('/'):
                            src = 'https://www.rami-levy.co.il' + src
                        # Extract actual image URL from CDN proxy if present
                        if '/_ipx/' in src and 'https://img.rami-levy.co.il' in src:
                            match = re.search(r'https://img\.rami-levy\.co\.il[^)]+', src)
                            if match:
                                src = match.group(0)
                        image_url = src
                        break
            except:
                continue

        return image_url

    except Exception as e:
        print(f"Error scraping barcode {barcode}: {str(e)}")
        # If the browser crashed, reset it so next call gets a fresh one
        close_browser()
        return None

def main():
    import time
    
    try:
        # Count basic consumer products (milk, bread, eggs, flour, sugar, oil, rice, pasta, cheese, yogurt, butter, salt, coffee, tea)
        # Very popular = available in 100+ branches
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
                i.name ILIKE '%חלב%' OR i.name ILIKE '%לחם%' OR i.name ILIKE '%ביצ%' 
                OR i.name ILIKE '%קמח%' OR i.name ILIKE '%סוכר%' OR i.name ILIKE '%שמן%' 
                OR i.name ILIKE '%אורז%' OR i.name ILIKE '%פסטה%' OR i.name ILIKE '%מקרוני%'
                OR i.name ILIKE '%גבינ%' OR i.name ILIKE '%יוגורט%' OR i.name ILIKE '%חמאה%' 
                OR i.name ILIKE '%מלח%' OR i.name ILIKE '%קפה%' OR i.name ILIKE '%תה%'
            )
        """)
        result = cursor.fetchone()
        if not result or result[0] is None:
            print("No products found matching criteria")
            return
        total = result[0]
        print(f"Total products without images: {total}\n")
        
        batch_size = 50
        processed = 0
        success_count = 0
        fail_count = 0
        
        print("DEBUG: Starting while loop")
        print(f"DEBUG: processed={processed}, total={total}")
        while processed < total:
            print(f"DEBUG: Entered while loop iteration, processed={processed}")
            # Get next batch of basic consumer products
            print("DEBUG: About to execute query")
            try:
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
                    i.name ILIKE '%חלב%' OR i.name ILIKE '%לחם%' OR i.name ILIKE '%ביצ%' 
                    OR i.name ILIKE '%קמח%' OR i.name ILIKE '%סוכר%' OR i.name ILIKE '%שמן%' 
                    OR i.name ILIKE '%אורז%' OR i.name ILIKE '%פסטה%' OR i.name ILIKE '%מקרוני%'
                    OR i.name ILIKE '%גבינ%' OR i.name ILIKE '%יוגורט%' OR i.name ILIKE '%חמאה%' 
                    OR i.name ILIKE '%מלח%' OR i.name ILIKE '%קפה%' OR i.name ILIKE '%תה%'
                )
                LIMIT %s
                """, (batch_size,))
                print("DEBUG: Query executed successfully")
            except Exception as query_error:
                print(f"DEBUG: Query execution failed: {query_error}")
                import traceback
                traceback.print_exc()
                raise
            
            products = cursor.fetchall()
            print(f"DEBUG: fetchall returned {len(products) if products else 0} rows")
            if products and len(products) > 0:
                print(f"DEBUG: First row: {products[0]}")
            if not products:
                print("DEBUG: No products returned, breaking")
                break
            
            batch_num = (processed // batch_size) + 1
            print(f"\n=== Batch {batch_num} ({processed + 1}-{processed + len(products)} of {total}) ===\n")
            print(f"DEBUG: Got {len(products)} products in batch")
            
            for row in products:
                print(f"DEBUG: Processing row: {row}, length: {len(row)}")
                if len(row) != 3:
                    print(f"ERROR: Row doesn't have 3 columns: {row}")
                    continue
                product_id, barcode, name = row
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
                        # Mark as tried
                        cursor.execute(
                            "UPDATE app.items SET image_url = '', updated_at = NOW() WHERE id = %s",
                            (product_id,)
                        )
                        conn.commit()
                        print("[FAIL] No image\n")
                        fail_count += 1
                    
                    # Slow delay between requests (10 seconds to be safe)
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
        print(f"Success rate: {((success_count / processed) * 100):.1f}%")
            
    except Exception as e:
        print(f"Error: {str(e)}")
    finally:
        close_browser()
        cursor.close()
        conn.close()

if __name__ == '__main__':
    main()
