import sys
import io
import time
import requests
import psycopg2

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

def check_image_exists(barcode):
    """Check if image exists at direct URL"""
    url = f'https://img.rami-levy.co.il/product/{barcode}/small.jpg'
    
    try:
        response = requests.head(url, timeout=5, allow_redirects=True)
        if response.status_code == 200:
            return url
        return None
    except:
        return None

def main():
    try:
        # Just count - will process all in batches
        print("Counting products...")
        total = 10000  # Will stop early when no more products
        print(f"Starting direct URL check (will process up to {total} products)\n")
        
        processed = 0
        success_count = 0
        fail_count = 0
        batch_size = 100
        
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
                
                image_url = check_image_exists(barcode)
                
                if image_url:
                    cursor.execute(
                        "UPDATE app.items SET image_url = %s, updated_at = NOW() WHERE id = %s",
                        (image_url, product_id)
                    )
                    conn.commit()
                    print(f"[{processed}/{total}] ✓ {name}")
                    success_count += 1
                else:
                    cursor.execute(
                        "UPDATE app.items SET image_url = '', updated_at = NOW() WHERE id = %s",
                        (product_id,)
                    )
                    conn.commit()
                    print(f"[{processed}/{total}] ✗ {name}")
                    fail_count += 1
                
                # Small delay to be polite
                time.sleep(0.2)
            
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
