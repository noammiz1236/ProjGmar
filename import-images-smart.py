#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Smart image import for SmartCart
Priority: Popular products first (by price count)
Source: Direct Rami Levy URL (58% success rate vs 31% scraping)
"""

import sys
import io
import time
import requests
import psycopg2
from datetime import datetime

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

def check_rami_levy_image(barcode):
    """Check if image exists at Rami Levy direct URL"""
    url = f'https://img.rami-levy.co.il/product/{barcode}/small.jpg'
    
    try:
        response = requests.head(url, timeout=3, allow_redirects=True)
        if response.status_code == 200:
            return url
        return None
    except:
        return None

def check_open_food_facts(barcode):
    """Fallback: Check Open Food Facts API"""
    try:
        response = requests.get(
            f'https://world.openfoodfacts.org/api/v2/product/{barcode}.json',
            timeout=3
        )
        if response.status_code == 200:
            data = response.json()
            if data.get('status') == 1 and data.get('product'):
                return data['product'].get('image_url') or data['product'].get('image_front_url')
        return None
    except:
        return None

def main():
    print("╔════════════════════════════════════════════════╗")
    print("║   SmartCart - Smart Image Import              ║")
    print("║   Priority: Popular products first            ║")
    print("╚════════════════════════════════════════════════╝\n")
    
    try:
        # Count products without images
        cursor.execute("""
            SELECT COUNT(DISTINCT i.id)
            FROM app.items i
            WHERE i.barcode IS NOT NULL 
            AND LENGTH(i.barcode) >= 8 
            AND (i.image_url IS NULL OR i.image_url = '')
        """)
        total_without_images = cursor.fetchone()[0]
        
        print(f"📊 Products without images: {total_without_images:,}\n")
        
        # Ask user how many to process
        print("How many products to process?")
        print("  1. 1,000 (quick test)")
        print("  2. 10,000 (popular products)")
        print("  3. 50,000 (comprehensive)")
        print("  4. All products (may take hours)")
        
        choice = input("\nChoice (1-4): ").strip()
        
        limit_map = {
            '1': 1000,
            '2': 10000,
            '3': 50000,
            '4': total_without_images
        }
        
        limit = limit_map.get(choice, 1000)
        print(f"\n✓ Will process up to {limit:,} products\n")
        
        processed = 0
        rami_levy_success = 0
        open_food_success = 0
        fail_count = 0
        batch_size = 100
        
        start_time = datetime.now()
        
        while processed < limit:
            # Get next batch ordered by popularity (price count)
            cursor.execute("""
                SELECT i.id, i.barcode, i.name, COUNT(p.id) as price_count
                FROM app.items i
                LEFT JOIN app.prices p ON p.item_id = i.id
                WHERE i.barcode IS NOT NULL 
                AND LENGTH(i.barcode) >= 8 
                AND (i.image_url IS NULL OR i.image_url = '')
                GROUP BY i.id, i.barcode, i.name
                ORDER BY COUNT(p.id) DESC
                LIMIT %s
            """, (batch_size,))
            
            products = cursor.fetchall()
            if not products:
                print("\n✓ No more products to process")
                break
            
            batch_num = (processed // batch_size) + 1
            print(f"\n┌─ Batch {batch_num} ({processed + 1}-{processed + len(products)} of {limit:,}) ─┐")
            
            for product_id, barcode, name, price_count in products:
                processed += 1
                
                # Try Rami Levy first (best success rate)
                image_url = check_rami_levy_image(barcode)
                source = "Rami Levy"
                
                # Fallback to Open Food Facts
                if not image_url:
                    image_url = check_open_food_facts(barcode)
                    source = "Open Food"
                
                if image_url:
                    cursor.execute(
                        "UPDATE app.items SET image_url = %s, updated_at = NOW() WHERE id = %s",
                        (image_url, product_id)
                    )
                    conn.commit()
                    
                    if source == "Rami Levy":
                        rami_levy_success += 1
                        icon = "🛒"
                    else:
                        open_food_success += 1
                        icon = "🌍"
                    
                    # Truncate name for display
                    display_name = name[:40] + "..." if len(name) > 40 else name
                    print(f"{icon} [{processed:,}/{limit:,}] {display_name} ({price_count} prices)")
                else:
                    # Mark as tried but not found
                    cursor.execute(
                        "UPDATE app.items SET image_url = '', updated_at = NOW() WHERE id = %s",
                        (product_id,)
                    )
                    conn.commit()
                    fail_count += 1
                
                # Be polite to servers
                time.sleep(0.15)
            
            # Batch summary
            total_success = rami_levy_success + open_food_success
            success_rate = (total_success / processed * 100) if processed > 0 else 0
            
            elapsed = (datetime.now() - start_time).total_seconds()
            rate = processed / elapsed if elapsed > 0 else 0
            eta_seconds = (limit - processed) / rate if rate > 0 else 0
            eta_minutes = eta_seconds / 60
            
            print(f"└─ Progress: {total_success:,} found ({success_rate:.1f}%), {fail_count:,} missing")
            print(f"   Rate: {rate:.1f} products/sec | ETA: {eta_minutes:.1f} min\n")
        
        print("\n╔════════════════════════════════════════════════╗")
        print("║              Final Summary                     ║")
        print("╚════════════════════════════════════════════════╝")
        print(f"Total processed:     {processed:,}")
        print(f"Rami Levy images:    {rami_levy_success:,}")
        print(f"Open Food images:    {open_food_success:,}")
        print(f"Not found:           {fail_count:,}")
        
        total_success = rami_levy_success + open_food_success
        if processed > 0:
            print(f"Success rate:        {(total_success / processed * 100):.1f}%")
        
        elapsed = (datetime.now() - start_time).total_seconds()
        print(f"Time elapsed:        {elapsed / 60:.1f} minutes")
        print(f"Rate:                {processed / elapsed:.1f} products/sec")
        
        # Show database status
        cursor.execute("""
            SELECT 
                COUNT(*) FILTER (WHERE image_url IS NOT NULL AND image_url != '') as with_images,
                COUNT(*) FILTER (WHERE image_url IS NULL OR image_url = '') as without_images
            FROM app.items
            WHERE barcode IS NOT NULL
        """)
        with_images, without_images = cursor.fetchone()
        
        print(f"\nDatabase status:")
        print(f"  With images:    {with_images:,}")
        print(f"  Without images: {without_images:,}")
        print(f"  Coverage:       {(with_images / (with_images + without_images) * 100):.1f}%")
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        print(f"Processed {processed:,} products before stopping")
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        cursor.close()
        conn.close()
        print("\n✓ Database connection closed")

if __name__ == '__main__':
    main()
