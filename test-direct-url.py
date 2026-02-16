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
        print("Fetching first 50 products without images...")
        
        # Get first 50 products without images (simple query)
        cursor.execute("""
            SELECT id, barcode, name 
            FROM app.items 
            WHERE barcode IS NOT NULL 
            AND LENGTH(barcode) >= 8 
            AND (image_url IS NULL OR image_url = '')
            AND (
                name ILIKE '%%חלב%%' OR name ILIKE '%%לחם%%' OR name ILIKE '%%ביצ%%' 
                OR name ILIKE '%%קמח%%' OR name ILIKE '%%סוכר%%' OR name ILIKE '%%שמן%%' 
                OR name ILIKE '%%אורז%%' OR name ILIKE '%%פסטה%%' OR name ILIKE '%%מקרוני%%'
                OR name ILIKE '%%גבינ%%' OR name ILIKE '%%יוגורט%%' OR name ILIKE '%%חמאה%%' 
                OR name ILIKE '%%מלח%%' OR name ILIKE '%%קפה%%' OR name ILIKE '%%תה%%'
            )
            LIMIT 50
        """)
        
        products = cursor.fetchall()
        total = len(products)
        print(f"Found {total} products to check\n")
        
        success_count = 0
        fail_count = 0
        
        for idx, (product_id, barcode, name) in enumerate(products, 1):
            image_url = check_image_exists(barcode)
            
            if image_url:
                cursor.execute(
                    "UPDATE app.items SET image_url = %s, updated_at = NOW() WHERE id = %s",
                    (image_url, product_id)
                )
                conn.commit()
                print(f"[{idx}/{total}] ✓ {name}")
                success_count += 1
            else:
                cursor.execute(
                    "UPDATE app.items SET image_url = '', updated_at = NOW() WHERE id = %s",
                    (product_id,)
                )
                conn.commit()
                print(f"[{idx}/{total}] ✗ {name}")
                fail_count += 1
            
            # Small delay
            time.sleep(0.2)
        
        print(f"\n=== Summary ===")
        print(f"Total: {total}")
        print(f"Found: {success_count}")
        print(f"Not found: {fail_count}")
        print(f"Success rate: {((success_count / total) * 100):.1f}%")
            
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    main()
