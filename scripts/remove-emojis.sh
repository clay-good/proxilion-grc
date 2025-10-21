#!/bin/bash

# Remove all emojis and emoticons from markdown files
# This script ensures professional documentation for enterprise use

echo "Removing emojis from documentation..."

# Define emoji patterns to remove
EMOJI_PATTERN='🎉|✅|❌|⚡|🚀|💯|🔥|📊|📈|🎯|⚙️|🛡️|📞|✨|🌟|💡|🔧|📝|📋|🎨|🏗️|🔒|🔓|⚠️|💻|📦|🌐|🔍|📁|📂|🗂️|📄|📃|📑|🗃️|🗄️|📇|🗂️|📅|📆|🗓️|📉|📊|📈|📌|📍|📎|🖇️|📏|📐|✂️|🗑️|🔗|🔨|⚒️|🛠️|⚙️|🔩|⚗️|🧪|🧬|🔬|🔭|📡|💉|💊|🩹|🩺|🌡️|🧲|🧰|🧯|🔦|🕯️|💡|🔌|🔋|📱|💻|🖥️|⌨️|🖱️|🖨️|💾|💿|📀|🧮|🎥|🎬|📷|📸|📹|📼|🔍|🔎|🕯️|💡|📔|📕|📖|📗|📘|📙|📚|📓|📒|📃|📜|📄|📰|🗞️|📑|🔖|🏷️|💰|💴|💵|💶|💷|💸|💳|🧾|💹|✉️|📧|📨|📩|📤|📥|📦|📫|📪|📬|📭|📮|🗳️|✏️|✒️|🖋️|🖊️|🖌️|🖍️|📝|💼|📁|📂|🗂️|📅|📆|🗒️|🗓️|📇|📈|📉|📊|📋|📌|📍|📎|🖇️|📏|📐|✂️|🗃️|🗄️|🗑️'

# Find all markdown files and remove emojis
find . -name "*.md" -type f ! -path "*/node_modules/*" ! -path "*/.next/*" | while read file; do
    # Create backup
    cp "$file" "$file.bak"
    
    # Remove emojis using sed
    sed -i.tmp "s/$EMOJI_PATTERN//g" "$file"
    
    # Remove temporary file
    rm -f "$file.tmp"
    
    echo "Processed: $file"
done

# Clean up backup files
find . -name "*.md.bak" -type f ! -path "*/node_modules/*" -delete

echo "Emoji removal complete!"

