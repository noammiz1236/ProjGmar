#!/bin/bash

# הנתיב לתיקיית המחירים בתוך הפרויקט הראשי
TARGET_DIR="/root/Desktop/server/ProjGmar_Backend/my_prices"

echo "Cleaning old files in $TARGET_DIR..."
rm -rf $TARGET_DIR/*

echo "Starting crawler..."
# הרצת הדוקר של הסורק ומעבר הנתונים לתיקייה הפיזית בשרת
docker run --rm -v "$TARGET_DIR:/usr/src/app/dumps" erlichsefi/israeli-supermarket-scarpers:latest


# שינוי הרשאות לקבצים שירדו כדי שהשרת (Node.js) יוכל לקרוא אותם בלי בעיות
chmod -R 777 $TARGET_DIR

echo "Done! New prices are ready."
