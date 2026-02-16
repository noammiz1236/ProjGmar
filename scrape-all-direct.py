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
        print("Starting direct URL check on all products without images...\n")
        
        success_count = 0
        fail_count = 0
        batch_size = 100
        processed = 0
        
        while True:
            # Get next batch - simple query, no complex filters
            cursor.execute("""
                SELECT id, barcode, name 
                FROM app.items 
                WHERE barcode IS NOT NULL 
                AND LENGTH(barcode) >= 8 
                AND (image_url IS NULL OR image_url = '')
                LIMIT %s
            """, (batch_size,))
            
            products = cursor.fetchall()
            if not products:
                print("\nNo more products to process.")
                break
            
            batch_num = (processed // batch_size) + 1
            print(f"\n=== Batch {batch_num} ({processed + 1}-{processed + len(products)}) ===\n")
            
            for product_id, barcode, name in products:
                processed += 1
                
                image_url = check_image_exists(barcode)
                
                if image_url:
                    cursor.execute(
                        "UPDATE app.items SET image_url = %s, updated_at = NOW() WHERE id = %s",
                        (image_url, product_id)
                    )
                    conn.commit()
                    print(f"[{processed}] ✓ {name}")
                    success_count += 1
                else:
                    cursor.execute(
                        "UPDATE app.items SET image_url = '', updated_at = NOW() WHERE id = %s",
                        (product_id,)
                    )
                    conn.commit()
                    fail_count += 1
                    # Don't print failures to keep output clean
                
                # Very small delay
                time.sleep(0.1)
            
            print(f"\nProgress: {success_count} found, {fail_count} not found ({(success_count/(success_count+fail_count)*100):.1f}% success)")
            
            # Stop if we processed 5000 products (safety limit)
            if processed >= 5000:
                print("\nReached safety limit of 5000 products. Run again to continue.")
                break
        
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
